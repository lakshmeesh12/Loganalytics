# monitor.py
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

load_dotenv()

class MonitorAgent(AssistantAgent):
    def __init__(self, name, llm_config, analyzer_agent=None, ws_manager=None):
        super().__init__(name=name, llm_config=llm_config)
        self.logger = logging.getLogger("MONITOR")
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log"),
                logging.StreamHandler()
            ]
        )
        self.ws_manager = ws_manager 
        # Windows log configuration
        self.config = configparser.ConfigParser()
        config_path = os.getenv("CONFIG_PATH", "C:/Users/Quadrant/Loganalytics/Backend/config.ini")
        if os.path.exists(config_path):
            self.config.read(config_path)
            self.target_server = self.config.get('Windows', 'TargetServer', fallback='localhost')
        else:
            self.target_server = os.getenv("WINDOWS_TARGET_SERVER", "localhost")
        self.hostname = socket.gethostname() if self.target_server == "localhost" else self.target_server
        self.WINDOWS_REGION = 'us-east-1'
        self.WINDOWS_LOG_GROUP_PREFIX = f"/windows/{self.hostname}"
        self.windows_cloudwatch = boto3.client("logs", region_name=self.WINDOWS_REGION)
        # Snowflake configuration
        self.SNOWFLAKE_REGION = 'us-east-2'
        self.SNOWFLAKE_LOG_GROUP_PREFIX = "/snowflake/"
        self.snowflake_cloudwatch = boto3.client("logs", region_name=self.SNOWFLAKE_REGION)
        # Kubernetes configuration
        self.KUBERNETES_REGION = 'ap-south-1'
        self.KUBERNETES_LOG_GROUP = "/aws/eks/crash-fix-cluster/cluster"
        self.kubernetes_cloudwatch = boto3.client("logs", region_name=self.KUBERNETES_REGION)
        self.seen_event_ids = set()
        self.analyzer_agent = analyzer_agent
        self.snowflake_enabled = self.analyzer_agent.snowflake_conn is not None if analyzer_agent else False
        # Track application startup time for real-time monitoring
        self.startup_time = int(time.time() * 1000)

    async def broadcast_message(self, agent, status, timestamp, details, reference):
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

    async def _async_broadcast(self, agent, status, timestamp, details, reference):
        await self.broadcast_message(agent, status, timestamp, details, reference)

    def get_recent_log_groups(self, cloudwatch_client, log_group_prefix=None):
        """Fetch recent CloudWatch log groups for a given client and prefix."""
        self.logger.info(f"Fetching recent CloudWatch log groups for prefix: {log_group_prefix or 'single group'}...")
        log_groups = []
        try:
            if log_group_prefix:
                paginator = cloudwatch_client.get_paginator('describe_log_groups')
                for page in paginator.paginate(logGroupNamePrefix=log_group_prefix):
                    for group in page['logGroups']:
                        log_groups.append(group['logGroupName'])
            else:
                log_groups = [self.KUBERNETES_LOG_GROUP]
            self.logger.info(f"Found {len(log_groups)} log groups")
            return log_groups
        except Exception as e:
            self.logger.error(f"Error fetching log groups: {e}")
            return []

    async def search_windows_errors(self, log_group):
        """Search for Windows Event ID 7003 in a log group in real-time."""
        now = int(time.time() * 1000)
        self.logger.debug(f"Searching for Windows Event ID 7003 errors in log group: {log_group}")

        try:
            response = self.windows_cloudwatch.filter_log_events(
                logGroupName=log_group,
                startTime=self.startup_time,  # Only fetch logs after application startup
                endTime=now,
                filterPattern='{ $.EventID = 7003 }'  # Filter for Event ID 7003
            )
            for event in response.get("events", []):
                event_id = event.get("eventId")
                if event_id in self.seen_event_ids:
                    self.logger.debug(f"Skipping duplicate event ID: {event_id}")
                    continue
                self.seen_event_ids.add(event_id)
                try:
                    event_data = json.loads(event["message"])
                    # Verify EventID and Source for accuracy
                    if event_data.get("EventID") != 7003 or event_data.get("Source") != "Service Control Manager":
                        self.logger.debug(f"Skipping non-7003 or non-SCM event: EventID={event_data.get('EventID')}, Source={event_data.get('Source')}")
                        continue
                    # Construct error message only for valid 7003 events
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
                    await self._async_broadcast("MonitorAgent", "error detected", timestamp, details, ref)
                    self.logger.error(f"Windows Event ID 7003 detected: {service_name} failed to start in {log_group}")
                    with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                        f.write(f"[{datetime.now()}] {error_message}\n{'-' * 60}\n")
                    self.logger.info("Logged Windows Event ID 7003 error to windows_errors.log")
                    if self.analyzer_agent:
                        self.analyzer_agent.logger.info("AnalyzerAgent triggered for Windows Event ID 7003 error")
                        analysis_result = self.analyzer_agent.analyze_error(error_message, source="windows")
                        analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                        analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                        await self._async_broadcast("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                        # Prepare for fixer
                        output = {
                            "reference": ref,
                            "error": error_message,
                            "root_cause": analysis_result.get("root_cause", "Unknown"),
                            "remediation_steps": analysis_result.get("remediation_steps", []),
                            "source": "windows"
                        }
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.analyzer_agent.logger.info("Analysis result written to fix_queue.json")
                except json.JSONDecodeError as e:
                    self.logger.error(f"Failed to parse Windows log JSON: {e}")
                    self.logger.debug(f"Skipped malformed Windows log event: {event['message'][:100]}...")
        except Exception as e:
            self.logger.error(f"Error searching Windows logs in {log_group}: {e}")
            with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Error searching Windows logs in {log_group}: {e}\n{'-' * 60}\n")

    async def search_snowflake_errors(self, log_group):
        """Search for Snowflake errors in a log group."""
        if not self.snowflake_enabled:
            self.logger.warning(f"Skipping Snowflake log monitoring: No Snowflake connection")
            return
        now = int(time.time() * 1000)
        start_time = self.startup_time  # Only fetch logs after application startup
        self.logger.debug(f"Searching for Snowflake errors in log group: {log_group}")

        try:
            response = self.snowflake_cloudwatch.filter_log_events(
                logGroupName=log_group,
                startTime=start_time,
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
                    await self._async_broadcast("MonitorAgent", "error detected", timestamp, details, ref)
                    self.logger.error(f"Snowflake error detected in {log_group}")
                    try:
                        with open("C:/Users/Quadrant/Loganalytics/Backend/snowflake_errors.log", "a", encoding="utf-8") as f:
                            f.write(error_message + '-' * 60 + "\n")
                        self.logger.info("Logged Snowflake error to snowflake_errors.log")
                    except Exception as e:
                        self.logger.error(f"Failed to write Snowflake error to file: {e}")

                    if self.analyzer_agent:
                        self.analyzer_agent.logger.info("AnalyzerAgent triggered for Snowflake error")
                        analysis_result = self.analyzer_agent.analyze_error(error_message, source="snowflake")
                        analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                        analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                        await self._async_broadcast("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                        # Prepare for fixer
                        output = {
                            "reference": ref,
                            "error": error_message,
                            "root_cause": analysis_result.get("root_cause", "Unknown"),
                            "remediation_steps": analysis_result.get("remediation_steps", []),
                            "source": "snowflake"
                        }
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.analyzer_agent.logger.info("Analysis result written to fix_queue.json")
        except Exception as e:
            self.logger.error(f"Error searching Snowflake logs: {e}")

    async def search_kubernetes_errors(self, log_group):
        """Search for Kubernetes OOMKilled errors in a log group."""
        now = int(time.time() * 1000)
        start_time = self.startup_time  # Only fetch logs after application startup
        self.logger.debug(f"Searching for Kubernetes errors in log group: {log_group}")

        try:
            response = self.kubernetes_cloudwatch.filter_log_events(
                logGroupName=log_group,
                startTime=start_time,
                endTime=now,
                filterPattern="OOMKilled"
            )
            for event in response.get("events", []):
                event_id = event.get("eventId")
                if event_id in self.seen_event_ids:
                    self.logger.info(f"Skipping duplicate event ID: {event_id}")
                    continue
                self.seen_event_ids.add(event_id)
                msg = event["message"]

                if "OOMKilled" in msg:
                    try:
                        event_data = json.loads(msg)
                        if event_data.get("kind") == "Event" and event_data.get("apiVersion") == "audit.k8s.io/v1":
                            if "Pod \"oom-test\" is invalid" in msg or "Forbidden" in msg:
                                self.logger.info(f"Skipping audit log for kubectl apply failure: {msg[:100]}...")
                                continue

                        namespace = event_data.get("objectRef", {}).get("namespace")
                        pod_name = event_data.get("objectRef", {}).get("name")
                        container_statuses = event_data.get("requestObject", {}).get("status", {}).get("containerStatuses", [])
                        for status in container_statuses:
                            if status.get("lastState", {}).get("terminated", {}).get("reason") == "OOMKilled":
                                container_name = status.get("name")
                                error_message = f"Container {container_name} in pod {namespace}/{pod_name} killed due to OutOfMemory"
                                break
                        else:
                            self.logger.warning(f"No OOMKilled container found in JSON: {msg[:100]}...")
                            continue

                        ref = str(uuid.uuid4())
                        error_message += f"\nReference: {ref}"
                        timestamp = datetime.now().strftime("%H:%M:%S")
                        details = f"Kubernetes OOMKilled error detected\n\nContainer {container_name} in pod {namespace}/{pod_name} killed due to OutOfMemory"
                        await self._async_broadcast("MonitorAgent", "error detected", timestamp, details, ref)
                        self.logger.error(f"Kubernetes OOMKilled error detected in {log_group}")
                        with open("C:/Users/Quadrant/Loganalytics/Backend/kubernetes_errors.log", "a", encoding="utf-8") as f:
                            f.write(error_message + '-' * 60 + "\n")
                        self.logger.info("Logged Kubernetes error to kubernetes_errors.log")

                        if self.analyzer_agent:
                            self.analyzer_agent.logger.info("AnalyzerAgent triggered for Kubernetes error")
                            analysis_result = self.analyzer_agent.analyze_error(error_message, source="kubernetes")
                            analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                            analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                            await self._async_broadcast("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                            # Prepare for fixer
                            output = {
                                "reference": ref,
                                "error": error_message,
                                "root_cause": analysis_result.get("root_cause", "Unknown"),
                                "remediation_steps": analysis_result.get("remediation_steps", []),
                                "manifest_file": analysis_result.get("manifest_file", None),
                                "source": "kubernetes"
                            }
                            with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                                json.dump(output, out, indent=4)
                            self.analyzer_agent.logger.info("Analysis result written to fix_queue.json")
                    except json.JSONDecodeError as e:
                        self.logger.error(f"Failed to parse Kubernetes log JSON: {e}")
                        ref = str(uuid.uuid4())
                        error_message = f"Kubernetes Error in {log_group}:\n{msg}\nReference: {ref}"
                        timestamp = datetime.now().strftime("%H:%M:%S")
                        details = f"Kubernetes error detected\n\n{msg[:100]}..."
                        await self._async_broadcast("MonitorAgent", "error detected", timestamp, details, ref)
                        with open("C:/Users/Quadrant/Loganalytics/Backend/kubernetes_errors.log", "a", encoding="utf-8") as f:
                            f.write(error_message + '-' * 60 + "\n")
                        self.logger.info("Logged Kubernetes error to kubernetes_errors.log")
                        if self.analyzer_agent:
                            self.analyzer_agent.logger.info("AnalyzerAgent triggered for Kubernetes error")
                            analysis_result = self.analyzer_agent.analyze_error(error_message, source="kubernetes")
                            analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                            analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                            await self._async_broadcast("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)
                            # Prepare for fixer
                            output = {
                                "reference": ref,
                                "error": error_message,
                                "root_cause": analysis_result.get("root_cause", "Unknown"),
                                "remediation_steps": analysis_result.get("remediation_steps", []),
                                "manifest_file": analysis_result.get("manifest_file", None),
                                "source": "kubernetes"
                            }
                            with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                                json.dump(output, out, indent=4)
                            self.analyzer_agent.logger.info("Analysis result written to fix_queue.json")
                    except Exception as e:
                        self.logger.error(f"Failed to write Kubernetes error to file: {e}")
        except Exception as e:
            self.logger.error(f"Error searching Kubernetes logs: {e}")

    async def run_async(self):
        self.logger.info(f"Starting CloudWatch logs monitoring for Windows ({self.hostname}), Snowflake, and Kubernetes...")
        try:
            while True:
                # Monitor Windows logs
                windows_groups = self.get_recent_log_groups(self.windows_cloudwatch, self.WINDOWS_LOG_GROUP_PREFIX)
                for group in windows_groups:
                    await self.search_windows_errors(group)
                # Monitor Snowflake logs
                if self.snowflake_enabled:
                    snowflake_groups = self.get_recent_log_groups(self.snowflake_cloudwatch, self.SNOWFLAKE_LOG_GROUP_PREFIX)
                    for group in snowflake_groups:
                        await self.search_snowflake_errors(group)
                # Monitor Kubernetes logs
                kubernetes_groups = self.get_recent_log_groups(self.kubernetes_cloudwatch)
                for group in kubernetes_groups:
                    await self.search_kubernetes_errors(group)
                await asyncio.sleep(10)
        except asyncio.CancelledError:
            self.logger.info("Monitoring stopped by user")
        except Exception as e:
            self.logger.error(f"Error in monitoring loop: {e}")

    def run(self):
        """Synchronous wrapper for running the async monitor loop."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self.run_async())
        finally:
            loop.close()

if __name__ == "__main__":
    from agent import ErrorAnalyzerAgent
    llm_config = {"model": "gpt-4o", "api_key": os.getenv("OPEN_API_KEY")}
    analyzer_agent = ErrorAnalyzerAgent(name="ErrorAnalyzerAgent", llm_config=llm_config)
    monitor = MonitorAgent(name="MonitorAgent", llm_config=None, analyzer_agent=analyzer_agent)
    monitor.run()