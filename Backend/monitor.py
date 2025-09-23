import boto3
import time
import logging
import json
from autogen import AssistantAgent
import os
from datetime import datetime
from dotenv import load_dotenv
import socket
import configparser
import uuid
import re
import asyncio
from pymongo import MongoClient
from abc import ABC, abstractmethod

load_dotenv()

class ServiceMonitor(ABC):
    """Base class for service-specific monitors."""
    def __init__(self, config, logger, analyzer_agent, email_agent, ws_manager, mode):
        self.config = config
        self.logger = logger
        self.analyzer_agent = analyzer_agent
        self.email_agent = email_agent  # May be None in autonomous mode
        self.ws_manager = ws_manager
        self.mode = mode  # 'semi-autonomous' or 'autonomous'
        self.seen_event_ids = set()
        self.cloudwatch = boto3.client("logs", region_name=config.get("region"))
        self.startup_time = int(time.time() * 1000)

    def get_recent_log_groups(self, log_group_prefix=None):
        """Fetch recent CloudWatch log groups for a given client and prefix."""
        self.logger.info(f"Fetching recent CloudWatch log groups for prefix: {log_group_prefix or 'single group'}...")
        log_groups = []
        try:
            if log_group_prefix:
                paginator = self.cloudwatch.get_paginator('describe_log_groups')
                for page in paginator.paginate(logGroupNamePrefix=log_group_prefix):
                    for group in page['logGroups']:
                        log_groups.append(group['logGroupName'])
            else:
                log_groups = [self.config.get("log_group")]
            self.logger.info(f"Found {len(log_groups)} log groups")
            return log_groups
        except Exception as e:
            self.logger.error(f"Error fetching log groups: {e}")
            return []

    async def broadcast_message(self, agent, status, timestamp, details, reference):
        """Broadcast message to WebSocket and log."""
        message = {
            "agent": agent,
            "status": status,
            "time": timestamp,
            "details": details,
            "reference": reference
        }
        self.logger.info(f"Broadcasting message: {json.dumps(message)}")
        if self.ws_manager:
            await self.ws_manager.broadcast(message)

    @abstractmethod
    async def search_errors(self, log_group):
        """Search for errors in a log group."""
        pass

class WindowsMonitor(ServiceMonitor):
    """Monitor for Windows logs."""
    def __init__(self, config, logger, analyzer_agent, email_agent, ws_manager, mode):
        super().__init__(config, logger, analyzer_agent, email_agent, ws_manager, mode)

    async def search_errors(self, log_group):
        """Search for Windows Event ID 7003 in a log group in real-time."""
        now = int(time.time() * 1000)
        self.logger.debug(f"Searching for Windows Event ID 7003 errors in log group: {log_group}")

        try:
            response = self.cloudwatch.filter_log_events(
                logGroupName=log_group,
                startTime=self.startup_time,
                endTime=now,
                filterPattern='{ $.EventID = 7003 }'
            )
            for event in response.get("events", []):
                event_id = event.get("eventId")
                if event_id in self.seen_event_ids:
                    self.logger.debug(f"Skipping duplicate event ID: {event_id}")
                    continue
                self.seen_event_ids.add(event_id)
                try:
                    event_data = json.loads(event["message"])
                    if event_data.get("EventID") != 7003 or event_data.get("Source") != "Service Control Manager":
                        self.logger.debug(f"Skipping non-7003 or non-SCM event: EventID={event_data.get('EventID')}, Source={event_data.get('Source')}")
                        continue
                    service_name = event_data.get("Message", [""])[0].split(" service")[0] if event_data.get("Message") else "Unknown"
                    error_message = (
                        f"Windows Error Detected\n"
                        f"Source: Windows\n"
                        f"LogGroup: {log_group}\n"
                        f"EventID: {event_data['EventID']}\n"
                        f"Service: {service_name}\n"
                        f"TimeGenerated: {event_data.get('TimeGenerated', 'Unknown')}\n"
                        f"Message: Service failed to start due to dependency error\n"
                        f"ComputerName: {event_data.get('ComputerName', 'Unknown')}\n"
                        f"RecordNumber: {event_data.get('RecordNumber', 'Unknown')}"
                    )
                    ref = str(uuid.uuid4())
                    error_message += f"\nReference: {ref}"
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    details = (
                        f"Windows Event ID 7003 detected\n\n"
                        f"Event: Service Control Manager - {service_name} service failed to start"
                    )
                    await self.broadcast_message("WindowsMonitor", "error detected", timestamp, details, ref)
                    self.logger.error(f"Windows Event ID 7003 detected: {service_name} failed to start in {log_group}")
                    
                    if self.mode == "semi-autonomous" and self.email_agent:
                        self.logger.info(f"Semi-autonomous mode: Sending error to EmailAgent for approval (Ref: {ref})")
                        await self.email_agent.handle_error(error_message, source="windows", reference=ref)
                    elif self.mode == "autonomous" and self.analyzer_agent:
                        with open(self.config.get("error_log_file"), "a", encoding="utf-8") as f:
                            f.write(f"[{datetime.now()}] {error_message}\n{'-' * 60}\n")
                        self.logger.info("Logged Windows Event ID 7003 error to windows_errors.log")
                        self.logger.info(f"Autonomous mode: Triggering AnalyzerAgent for Windows Event ID 7003 error (Ref: {ref})")
                        analysis_result = await self.analyzer_agent.analyze_error(error_message, source="windows")
                        analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                        analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                        await self.broadcast_message("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                        output = {
                            "reference": ref,
                            "error": error_message,
                            "root_cause": analysis_result.get("root_cause", "Unknown"),
                            "remediation_steps": analysis_result.get("remediation_steps", []),
                            "source": "windows"
                        }
                        with open(self.config.get("fix_queue_file"), 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.analyzer_agent.logger.info(f"Analysis result written to fix_queue.json for reference {ref}")
                except json.JSONDecodeError as e:
                    self.logger.error(f"Failed to parse Windows log JSON: {e}")
                    self.logger.debug(f"Skipped malformed Windows log event: {event['message'][:100]}...")
                except Exception as e:
                    self.logger.error(f"Failed to process Windows event: {e}")
        except Exception as e:
            self.logger.error(f"Error searching Windows logs in {log_group}: {e}")
            with open(self.config.get("error_log_file"), "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Error searching Windows logs in {log_group}: {e}\n{'-' * 60}\n")

class SnowflakeMonitor(ServiceMonitor):
    """Monitor for Snowflake logs."""
    def __init__(self, config, logger, analyzer_agent, email_agent, ws_manager, mode):
        super().__init__(config, logger, analyzer_agent, email_agent, ws_manager, mode)
        self.snowflake_enabled = analyzer_agent.snowflake_conn is not None if analyzer_agent else False

    async def search_errors(self, log_group):
        """Search for Snowflake errors in a log group."""
        if not self.snowflake_enabled:
            self.logger.warning(f"Skipping Snowflake log monitoring: No Snowflake connection")
            return
        now = int(time.time() * 1000)
        self.logger.debug(f"Searching for Snowflake errors in log group: {log_group}")

        try:
            response = self.cloudwatch.filter_log_events(
                logGroupName=log_group,
                startTime=self.startup_time,
                endTime=now,
            )
            for event in response.get("events", []):
                event_id = event.get("eventId")
                if event_id in self.seen_event_ids:
                    continue
                self.seen_event_ids.add(event_id)
                msg = event["message"]
                if "EXECUTION_STATUS: SUCCESS" not in msg and (
                    "ERROR_CODE: None" not in msg or "ERROR_MESSAGE: None" not in msg
                ):
                    ref = str(uuid.uuid4())
                    error_message = f"Snowflake Error in {log_group}:\n{msg}\nReference: {ref}"
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    details = f"Snowflake error detected\n\n{msg.splitlines()[0] if msg.splitlines() else 'Unknown error'}"
                    await self.broadcast_message("SnowflakeMonitor", "error detected", timestamp, details, ref)
                    self.logger.error(f"Snowflake error detected in {log_group}")
                    
                    if self.mode == "semi-autonomous" and self.email_agent:
                        self.logger.info(f"Semi-autonomous mode: Sending error to EmailAgent for approval (Ref: {ref})")
                        await self.email_agent.handle_error(error_message, source="snowflake", reference=ref)
                    elif self.mode == "autonomous" and self.analyzer_agent:
                        try:
                            with open(self.config.get("error_log_file"), "a", encoding="utf-8") as f:
                                f.write(error_message + '-' * 60 + "\n")
                            self.logger.info("Logged Snowflake error to snowflake_errors.log")
                        except Exception as e:
                            self.logger.error(f"Failed to write Snowflake error to file: {e}")
                        self.logger.info(f"Autonomous mode: Triggering AnalyzerAgent for Snowflake error (Ref: {ref})")
                        analysis_result = self.analyzer_agent.analyze_error(error_message, source="snowflake")
                        analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                        analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                        await self.broadcast_message("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                        output = {
                            "reference": ref,
                            "error": error_message,
                            "root_cause": analysis_result.get("root_cause", "Unknown"),
                            "remediation_steps": analysis_result.get("remediation_steps", []),
                            "source": "snowflake"
                        }
                        with open(self.config.get("fix_queue_file"), 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.analyzer_agent.logger.info(f"Analysis result written to fix_queue.json for reference {ref}")
        except Exception as e:
            self.logger.error(f"Error searching Snowflake logs: {e}")

class KubernetesMonitor(ServiceMonitor):
    """Monitor for Kubernetes logs."""
    def __init__(self, config, logger, analyzer_agent, email_agent, ws_manager, mode):
        super().__init__(config, logger, analyzer_agent, email_agent, ws_manager, mode)
        self.cooldown_tracker = {}  # Track pod errors with timestamps
        self.cooldown_period = 60  # Cooldown period in seconds

    async def search_errors(self, log_group):
        """Search for Kubernetes OOMKilled errors in a log group with cooldown and deduplication."""
        now = int(time.time() * 1000)
        current_time = time.time()
        self.logger.debug(f"Searching for Kubernetes errors in log group: {log_group}")

        try:
            response = self.cloudwatch.filter_log_events(
                logGroupName=log_group,
                startTime=self.startup_time,
                endTime=now,
                filterPattern="OOMKilled"
            )
            self.logger.info(f"Found {len(response.get('events', []))} events in {log_group}")
            for event in response.get("events", []):
                event_id = event.get("eventId")
                if event_id in self.seen_event_ids:
                    self.logger.info(f"Skipping duplicate event ID: {event_id}")
                    continue
                self.seen_event_ids.add(event_id)
                msg = event["message"]
                self.logger.debug(f"Raw event message: {msg[:200]}...")
                if "OOMKilled" not in msg:
                    continue
                try:
                    event_data = json.loads(msg)
                    if "Pod \"oom-test\" is invalid" in msg or "Forbidden" in msg:
                        self.logger.info(f"Skipping audit log for kubectl apply failure: {msg[:100]}...")
                        continue
                    namespace = event_data.get("objectRef", {}).get("namespace", "demo-app")
                    pod_name = event_data.get("objectRef", {}).get("name", "stress-demo")
                    pod_key = f"{namespace}/{pod_name}"
                    
                    # Check if pod is in cooldown
                    if pod_key in self.cooldown_tracker:
                        last_detected = self.cooldown_tracker[pod_key]["timestamp"]
                        if current_time - last_detected < self.cooldown_period:
                            self.logger.info(f"Skipping OOMKilled for {pod_key} due to cooldown (last detected: {datetime.fromtimestamp(last_detected)})")
                            continue

                    container_statuses = event_data.get("requestObject", {}).get("status", {}).get("containerStatuses", [])
                    for status in container_statuses:
                        container_name = status.get("name", "unknown")
                        if (status.get("state", {}).get("terminated", {}).get("reason") == "OOMKilled" or
                            status.get("lastState", {}).get("terminated", {}).get("reason") == "OOMKilled"):
                            error_message = f"Container {container_name} in pod {namespace}/{pod_name} killed due to OutOfMemory"
                            break
                    else:
                        self.logger.warning(f"No OOMKilled container found in JSON: {msg[:100]}...")
                        pattern = r"Container\s+([^\s]+)\s+in\s+pod\s+([^\s]+)/([^\s]+)\s+killed\s+due\s+to\s+OutOfMemory"
                        match = re.search(pattern, msg)
                        if match:
                            container_name, namespace, pod_name = match.groups()
                            error_message = f"Container {container_name} in pod {namespace}/{pod_name} killed due to OutOfMemory"
                            pod_key = f"{namespace}/{pod_name}"
                        else:
                            self.logger.warning(f"Skipping event, no OOMKilled details extracted: {msg[:100]}...")
                            continue
                    
                    # Update cooldown tracker
                    ref = str(uuid.uuid4())
                    self.cooldown_tracker[pod_key] = {"timestamp": current_time, "reference": ref}
                    error_message += f"\nReference: {ref}"
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    details = f"Kubernetes OOMKilled error detected\n\nContainer {container_name} in pod {namespace}/{pod_name}"
                    await self.broadcast_message("KubernetesMonitor", "error detected", timestamp, details, ref)
                    self.logger.error(f"Kubernetes OOMKilled error detected in {log_group}")
                    with open(self.config.get("error_log_file"), "a", encoding="utf-8") as f:
                        f.write(error_message + '-' * 60 + "\n")
                    self.logger.info("Logged Kubernetes error to kubernetes_errors.log")
                    
                    if self.mode == "semi-autonomous" and self.email_agent:
                        self.logger.info(f"Semi-autonomous mode: Sending error to EmailAgent for approval (Ref: {ref})")
                        await self.email_agent.handle_error(error_message, source="kubernetes", reference=ref)
                    elif self.mode == "autonomous" and self.analyzer_agent:
                        self.logger.info(f"Autonomous mode: Triggering AnalyzerAgent for Kubernetes error (Ref: {ref})")
                        analysis_result = await self.analyzer_agent.analyze_error(error_message, source="kubernetes")
                        analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                        analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                        await self.broadcast_message("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                        output = {
                            "reference": ref,
                            "error": error_message,
                            "root_cause": analysis_result.get("root_cause", "Unknown"),
                            "remediation_steps": analysis_result.get("remediation_steps", []),
                            "manifest_file": analysis_result.get("manifest_file", None),
                            "source": "kubernetes"
                        }
                        with open(self.config.get("fix_queue_file"), 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.analyzer_agent.logger.info(f"Analysis result written to fix_queue.json for reference {ref}")
                        self.cooldown_tracker[pod_key]["timestamp"] = time.time()
                except json.JSONDecodeError as e:
                    self.logger.error(f"Failed to parse Kubernetes log JSON: {e}")
                    pattern = r"Container\s+([^\s]+)\s+in\s+pod\s+([^\s]+)/([^\s]+)\s+killed\s+due\s+to\s+OutOfMemory"
                    match = re.search(pattern, msg)
                    if match:
                        container_name, namespace, pod_name = match.groups()
                        pod_key = f"{namespace}/{pod_name}"
                        if pod_key in self.cooldown_tracker:
                            last_detected = self.cooldown_tracker[pod_key]["timestamp"]
                            if current_time - last_detected < self.cooldown_period:
                                self.logger.info(f"Skipping OOMKilled for {pod_key} due to cooldown (last detected: {datetime.fromtimestamp(last_detected)})")
                                continue
                        ref = str(uuid.uuid4())
                        self.cooldown_tracker[pod_key] = {"timestamp": current_time, "reference": ref}
                        error_message = f"Container {container_name} in pod {namespace}/{pod_name} killed due to OutOfMemory\nReference: {ref}"
                        timestamp = datetime.now().strftime("%H:%M:%S")
                        details = f"Kubernetes OOMKilled error detected\n\nContainer {container_name} in pod {namespace}/{pod_name}"
                        await self.broadcast_message("KubernetesMonitor", "error detected", timestamp, details, ref)
                        with open(self.config.get("error_log_file"), "a", encoding="utf-8") as f:
                            f.write(error_message + '-' * 60 + "\n")
                        self.logger.info("Logged Kubernetes error to kubernetes_errors.log")
                        
                        if self.mode == "semi-autonomous" and self.email_agent:
                            self.logger.info(f"Semi-autonomous mode: Sending error to EmailAgent for approval (Ref: {ref})")
                            await self.email_agent.handle_error(error_message, source="kubernetes", reference=ref)
                        elif self.mode == "autonomous" and self.analyzer_agent:
                            self.logger.info(f"Autonomous mode: Triggering AnalyzerAgent for Kubernetes error (Ref: {ref})")
                            analysis_result = await self.analyzer_agent.analyze_error(error_message, source="kubernetes")
                            analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                            analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                            await self.broadcast_message("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                            output = {
                                "reference": ref,
                                "error": error_message,
                                "root_cause": analysis_result.get("root_cause", "Unknown"),
                                "remediation_steps": analysis_result.get("remediation_steps", []),
                                "manifest_file": analysis_result.get("manifest_file", None),
                                "source": "kubernetes"
                            }
                            with open(self.config.get("fix_queue_file"), 'w', encoding='utf-8') as out:
                                json.dump(output, out, indent=4)
                            self.analyzer_agent.logger.info(f"Analysis result written to fix_queue.json for reference {ref}")
                            self.cooldown_tracker[pod_key]["timestamp"] = time.time()
                    else:
                        self.logger.warning(f"Skipping non-JSON event, no OOMKilled details extracted: {msg[:100]}...")
                except Exception as e:
                    self.logger.error(f"Failed to process Kubernetes event: {e}")
        except Exception as e:
            self.logger.error(f"Error searching Kubernetes logs: {e}")

class DatabricksMonitor(ServiceMonitor):
    """Monitor for Databricks logs."""
    def __init__(self, config, logger, analyzer_agent, email_agent, ws_manager, mode):
        super().__init__(config, logger, analyzer_agent, email_agent, ws_manager, mode)

    async def search_errors(self, log_group):
        """Search for Databricks query failures in a log group."""
        now = int(time.time() * 1000)
        self.logger.debug(f"Searching for Databricks query failures in log group: {log_group}")

        try:
            response = self.cloudwatch.filter_log_events(
                logGroupName=log_group,
                startTime=self.startup_time,
                endTime=now,
                filterPattern='{ $.status = "FAILED" }'
            )
            for event in response.get("events", []):
                event_id = event.get("eventId")
                if event_id in self.seen_event_ids:
                    self.logger.debug(f"Skipping duplicate event ID: {event_id}")
                    continue
                self.seen_event_ids.add(event_id)
                try:
                    event_data = json.loads(event["message"])
                    if event_data.get("status") != "FAILED":
                        self.logger.debug(f"Skipping non-failed query: status={event_data.get('status')}")
                        continue
                    error_message = (
                        f"Databricks Query Failure Detected\n"
                        f"Source: Databricks\n"
                        f"LogGroup: {log_group}\n"
                        f"QueryID: {event_data.get('query_id', 'Unknown')}\n"
                        f"User: {event_data.get('user_name', 'Unknown')}\n"
                        f"QueryText: {event_data.get('query_text', 'Unknown')}\n"
                        f"StartTime: {event_data.get('start_time_ms', 'None')}\n"
                        f"EndTime: {event_data.get('end_time_ms', 'None')}\n"
                        f"ErrorMessage: {event_data.get('error_message', 'No error message available')}"
                    )
                    ref = str(uuid.uuid4())
                    error_message += f"\nReference: {ref}"
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    details = (
                        f"Databricks query failure detected\n\n"
                        f"Query: {event_data.get('query_text', 'Unknown')[:50]}...\n"
                        f"Error: {event_data.get('error_message', 'Unknown')}"
                    )
                    await self.broadcast_message("DatabricksMonitor", "error detected", timestamp, details, ref)
                    self.logger.error(f"Databricks query failure detected in {log_group}: {event_data.get('query_id')}")
                    
                    if self.mode == "semi-autonomous" and self.email_agent:
                        self.logger.info(f"Semi-autonomous mode: Sending error to EmailAgent for approval (Ref: {ref})")
                        await self.email_agent.handle_error(error_message, source="databricks", reference=ref)
                    elif self.mode == "autonomous" and self.analyzer_agent:
                        with open(self.config.get("error_log_file"), "a", encoding="utf-8") as f:
                            f.write(f"[{datetime.now()}] {error_message}\n{'-' * 60}\n")
                        self.logger.info("Logged Databricks query failure to databricks_errors.log")
                        self.logger.info(f"Autonomous mode: Triggering AnalyzerAgent for Databricks error (Ref: {ref})")
                        analysis_result = await self.analyzer_agent.analyze_error(error_message, source="databricks")
                        analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                        analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                        await self.broadcast_message("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                        output = {
                            "reference": ref,
                            "error": error_message,
                            "root_cause": analysis_result.get("root_cause", "Unknown"),
                            "remediation_steps": analysis_result.get("remediation_steps", []),
                            "source": "databricks"
                        }
                        with open(self.config.get("fix_queue_file"), 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.analyzer_agent.logger.info(f"Analysis result written to fix_queue.json for reference {ref}")
                except json.JSONDecodeError as e:
                    self.logger.error(f"Failed to parse Databricks log JSON: {e}")
                    self.logger.debug(f"Skipped malformed Databricks log event: {event['message'][:100]}...")
                except Exception as e:
                    self.logger.error(f"Failed to process Databricks event: {e}")
        except Exception as e:
            self.logger.error(f"Error searching Databricks logs in {log_group}: {e}")
            with open(self.config.get("error_log_file"), "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Error searching Databricks logs in {log_group}: {e}\n{'-' * 60}\n")

class MonitorAgent(AssistantAgent):
    def __init__(self, name, llm_config, analyzer_agent=None, email_agent=None, ws_manager=None, mode="semi-autonomous"):
        super().__init__(name=name, llm_config=llm_config)
        self.logger = logging.getLogger("MONITOR")
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler("C:/Users/Quadrant/Loganalytics/Backend/monitor.log"),
                logging.StreamHandler()
            ]
        )
        self.ws_manager = ws_manager
        self.analyzer_agent = analyzer_agent
        self.email_agent = email_agent
        self.mode = mode
        self.mongo_client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
        self.rules_db = self.mongo_client["rules_engine"]
        self.rules_collection = self.rules_db["rules"]
        self.service_monitors = self._initialize_monitors()

    def _initialize_monitors(self):
        """Initialize service-specific monitors."""
        config_base_path = "C:/Users/Quadrant/Loganalytics/Backend"
        config = {
            "windows": {
                "region": "ap-south-1",
                "log_group_prefix": f"/windows/{socket.gethostname()}",
                "error_log_file": f"{config_base_path}/windows_errors.log",
                "fix_queue_file": f"{config_base_path}/fix_queue.json"
            },
            "snowflake": {
                "region": "us-east-2",
                "log_group_prefix": "/snowflake/",
                "error_log_file": f"{config_base_path}/snowflake_errors.log",
                "fix_queue_file": f"{config_base_path}/fix_queue.json"
            },
            "eks": {
                "region": "ap-south-1",
                "log_group": "/aws/eks/crash-fix-cluster-2/cluster",
                "error_log_file": f"{config_base_path}/kubernetes_errors.log",
                "fix_queue_file": f"{config_base_path}/fix_queue.json"
            },
            "databricks": {
                "region": "ap-south-1",
                "log_group": "/aws/databricks/audit-logs",
                "error_log_file": f"{config_base_path}/databricks_errors.log",
                "fix_queue_file": f"{config_base_path}/fix_queue.json"
            }
        }
        return {
            "windows": WindowsMonitor(config["windows"], self.logger, self.analyzer_agent, self.email_agent, self.ws_manager, self.mode),
            "snowflake": SnowflakeMonitor(config["snowflake"], self.logger, self.analyzer_agent, self.email_agent, self.ws_manager, self.mode),
            "eks": KubernetesMonitor(config["eks"], self.logger, self.analyzer_agent, self.email_agent, self.ws_manager, self.mode),
            "databricks": DatabricksMonitor(config["databricks"], self.logger, self.analyzer_agent, self.email_agent, self.ws_manager, self.mode)
        }

    def get_active_data_sources(self):
        """Fetch data sources from active rules in the rules_engine database."""
        try:
            active_rules = self.rules_collection.find({"status": "Active"})
            data_sources = set(rule["data_source"] for rule in active_rules)
            self.logger.info(f"Active data sources: {data_sources}")
            return data_sources
        except Exception as e:
            self.logger.error(f"Error fetching active rules from MongoDB: {e}")
            return set()

    async def run_async(self):
        self.logger.info(f"Starting CloudWatch logs monitoring for active rules in {self.mode} mode...")
        try:
            while True:
                active_data_sources = self.get_active_data_sources()
                for source, monitor in self.service_monitors.items():
                    if source in active_data_sources:
                        log_groups = monitor.get_recent_log_groups(monitor.config.get("log_group_prefix"))
                        for group in log_groups:
                            await monitor.search_errors(group)
                    else:
                        self.logger.info(f"Skipping {source} log monitoring: No active rules for '{source}'")
                await asyncio.sleep(10)
        except asyncio.CancelledError:
            self.logger.info("Monitoring stopped by user")
        except Exception as e:
            self.logger.error(f"Error in monitoring loop: {e}")
        finally:
            self.mongo_client.close()

    def run(self):
        """Synchronous wrapper for running the async monitor loop."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self.run_async())
        finally:
            loop.close()