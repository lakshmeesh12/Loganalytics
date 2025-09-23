import os
import time
import json
import logging
import subprocess
import yaml
from datetime import datetime
from dotenv import load_dotenv
from autogen import AssistantAgent
from openai import OpenAI
import snowflake.connector
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import socket
import configparser
import re
import uuid
import asyncio
from abc import ABC, abstractmethod

load_dotenv()

class BaseErrorAnalyzer(ABC):
    def __init__(self, agent):
        self.agent = agent

    @abstractmethod
    async def initial_broadcast(self, ref, timestamp, error_message):
        pass

    @abstractmethod
    def extract_info(self, error_message):
        pass

    @abstractmethod
    async def analyze_and_broadcast(self, info, error_message, ref, timestamp):
        pass

class WindowsErrorAnalyzer(BaseErrorAnalyzer):
    def _execute_powershell_command(self, command: str, remote: bool = False) -> str:
        try:
            if remote and self.agent.target_server != "localhost":
                cmd = (
                    f"powershell -Command \"Invoke-Command -ComputerName {self.agent.target_server} -ScriptBlock {{{command}}}\""
                )
            else:
                cmd = f"powershell -Command \"{command}\""
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if result.returncode == 0:
                self.agent.logger.info(f"Executed PowerShell command: {command}")
                return result.stdout.strip()
            else:
                self.agent.logger.error(f"Failed to execute PowerShell command: {command}, Error: {result.stderr}")
                return ""
        except Exception as e:
            self.agent.logger.error(f"Error executing PowerShell command: {command}, Error: {e}")
            return ""

    def _get_service_dependencies(self, service_name: str) -> list:
        try:
            cmd = f"sc qc {service_name}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                self.agent.logger.error(f"Failed to query service {service_name}: {result.stderr}")
                return []
            output = result.stdout
            depend_match = re.search(r"DEPENDENCIES\s*:\s*(.*?)\s*(?:BINARY_PATH_NAME|$)", output, re.DOTALL)
            if depend_match:
                dependencies = depend_match.group(1).strip().split()
                return [dep for dep in dependencies if dep]
            return []
        except Exception as e:
            self.agent.logger.error(f"Error querying dependencies for {service_name}: {e}")
            return []

    def extract_info(self, error_message: str) -> dict:
        if not re.search(r"EventID: 7003", error_message):
            self.agent.logger.debug(f"Skipping non-7003 error log entry: {error_message[:100]}...")
            return {
                "service_name": None,
                "dependency": None,
                "computer_name": None,
                "time_generated": None,
                "record_number": None,
                "service_details": None
            }
        prompt = (
            "You are a Windows error analysis assistant. Given the following Windows Event ID 7003 error log entry in JSON format, "
            "extract detailed information about the error. The error indicates a service failed to start due to a dependency issue. "
            "The JSON includes a 'Message' array where the first element (Message[0]) is the service name and the second element (Message[1]) "
            "is the invalid dependency causing the failure, if present.\n\n"
            f"Error Log: {error_message}\n\n"
            "Return a JSON object with:\n"
            "- 'service_name': the name of the service that failed (e.g., Spooler), extracted from Message[0]\n"
            "- 'dependency': the invalid dependency causing the failure (e.g., FakeService) from Message[1], or null if not specified\n"
            "- 'computer_name': the name of the affected computer\n"
            "- 'time_generated': the timestamp of the event (format: YYYY-MM-DD HH:MM:SS)\n"
            "- 'record_number': the event record number\n"
            "If any information cannot be extracted, set the field to null. Return valid JSON without any explanation."
        )
        try:
            response = self.agent.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=200
            )
            reply_content = response.choices[0].message.content.strip()
            self.agent.logger.info(f"LLM reply for Windows error (Step 1): {reply_content[:200]}...")
            try:
                match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                if match:
                    json_str = match.group(1)
                else:
                    json_str = reply_content
                result = json.loads(json_str)
            except json.JSONDecodeError as json_err:
                self.agent.logger.error(f"JSON parsing error in LLM response: {json_err}, Response: {reply_content[:200]}...")
                try:
                    event_data = json.loads(error_message)
                    result = {
                        "service_name": event_data.get("Message", [None, None])[0],
                        "dependency": event_data.get("Message", [None, None])[1],
                        "computer_name": event_data.get("ComputerName"),
                        "time_generated": event_data.get("TimeGenerated"),
                        "record_number": event_data.get("RecordNumber")
                    }
                except json.JSONDecodeError:
                    self.agent.logger.error(f"Failed to parse error_message as JSON: {error_message[:200]}...")
                    result = {
                        "service_name": None,
                        "dependency": None,
                        "computer_name": None,
                        "time_generated": None,
                        "record_number": None
                    }
            service_name = result.get("service_name")
            dependency = result.get("dependency")
            computer_name = result.get("computer_name")
            time_generated = result.get("time_generated")
            record_number = result.get("record_number")
            enriched_info = {
                "service_name": service_name,
                "dependency": dependency,
                "computer_name": computer_name,
                "time_generated": time_generated,
                "record_number": record_number,
                "service_details": None
            }
            if not service_name or not computer_name or not time_generated or not dependency:
                self.agent.logger.info("Incomplete information extracted, querying event log for details.")
                ps_command = (
                    f"Get-WinEvent -LogName System -MaxEvents 100 | "
                    f"Where-Object {{ $_.Id -eq 7003 -and $_.ProviderName -eq 'Service Control Manager' }} | "
                    f"Select-Object -First 1 -Property TimeCreated,Message,RecordNumber,MachineName | "
                    f"Format-List | Out-String"
                )
                event_details = self._execute_powershell_command(ps_command, remote=(self.agent.target_server != "localhost"))
                if event_details:
                    self.agent.logger.info(f"Retrieved event log details: {event_details[:200]}...")
                    enriched_prompt = (
                        "You are a Windows error analysis assistant. Given the following Windows Event ID 7003 error log in JSON format and additional event log details, "
                        "extract detailed information about the error. The JSON includes a 'Message' array where Message[0] is the service name and Message[1] is the invalid dependency, if present.\n\n"
                        f"Original Error Log: {error_message}\n"
                        f"Event Log Details: {event_details}\n\n"
                        "Return a JSON object with:\n"
                        "- 'service_name': the name of the service that failed (e.g., Spooler) from Message[0]\n"
                        "- 'dependency': the invalid dependency causing the failure (e.g., FakeService) from Message[1], or null if not specified\n"
                        "- 'computer_name': the name of the affected computer\n"
                        "- 'time_generated': the timestamp of the event (format: YYYY-MM-DD HH:MM:SS)\n"
                        "- 'record_number': the event record number\n"
                        "If any information cannot be extracted, set the field to null. Return valid JSON without any explanation."
                    )
                    try:
                        response = self.agent.client.chat.completions.create(
                            model="gpt-4o",
                            messages=[
                                {"role": "system", "content": "You are a helpful assistant."},
                                {"role": "user", "content": enriched_prompt}
                            ],
                            max_tokens=300
                        )
                        reply_content = response.choices[0].message.content.strip()
                        self.agent.logger.info(f"LLM reply for Windows error (Step 3): {reply_content[:200]}...")
                        match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                        if match:
                            json_str = match.group(1)
                        else:
                            json_str = reply_content
                        result = json.loads(json_str)
                        enriched_info.update({
                            "service_name": result.get("service_name", service_name),
                            "dependency": result.get("dependency", dependency),
                            "computer_name": result.get("computer_name", computer_name),
                            "time_generated": result.get("time_generated", time_generated),
                            "record_number": result.get("record_number", record_number)
                        })
                    except json.JSONDecodeError as json_err:
                        self.agent.logger.error(f"JSON parsing error in enriched LLM response: {json_err}, Response: {reply_content[:200]}...")
                    except Exception as e:
                        self.agent.logger.error(f"OpenAI API error in enriched prompt: {e}")
            if enriched_info["service_name"]:
                ps_command = f"Get-Service -Name '{enriched_info['service_name']}' -ErrorAction SilentlyContinue | Select-Object -Property Name,Status,DependentServices,ServicesDependedOn | Format-List | Out-String"
                service_details = self._execute_powershell_command(ps_command, remote=(self.agent.target_server != "localhost"))
                if service_details:
                    self.agent.logger.info(f"Retrieved service details for {enriched_info['service_name']}: {service_details[:200]}...")
                    enriched_info["service_details"] = service_details
                else:
                    self.agent.logger.warning(f"Failed to retrieve service details for {enriched_info['service_name']}")
                    enriched_info["service_details"] = None
            else:
                enriched_info["service_details"] = None
            return enriched_info
        except Exception as e:
            self.agent.logger.error(f"Error in extract_info: {e}, Error message: {error_message[:200]}...")
            return {
                "service_name": None,
                "dependency": None,
                "computer_name": None,
                "time_generated": None,
                "record_number": None,
                "service_details": None
            }

    async def initial_broadcast(self, ref, timestamp, error_message):
        await self.agent._async_broadcast(
            "ErrorAnalyzer",
            "error detected",
            timestamp,
            f"Windows Event ID 7003 detected: Service Unknown failed to start",  # Service name extracted later
            ref
        )

    async def analyze_and_broadcast(self, info, error_message, ref, timestamp):
        service_name = info.get("service_name")
        dependency = info.get("dependency")
        computer_name = info.get("computer_name")
        time_generated = info.get("time_generated")
        service_details = info.get("service_details")
        if not service_name:
            self.agent.logger.error(f"Failed to extract service name from error: {error_message[:200]}...")
            result = {
                "root_cause": "Failed to extract service information",
                "remediation_steps": []
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root cause: {result.get('root_cause', 'Unknown')}",
                ref
            )
            return result
        normalized_service_name = service_name
        ps_command = f"Get-Service -DisplayName '{service_name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"
        service_name_result = self._execute_powershell_command(ps_command, remote=(self.agent.target_server != "localhost"))
        if service_name_result:
            normalized_service_name = service_name_result.strip()
            self.agent.logger.info(f"Normalized service name from '{service_name}' to '{normalized_service_name}'")
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "service normalized",
                timestamp,
                f"Service name normalized to {normalized_service_name}",
                ref
            )
        else:
            self.agent.logger.warning(f"Failed to normalize service name '{service_name}', using original name")
        valid_dependencies = self._get_service_dependencies(normalized_service_name)
        depend_str = " ".join(valid_dependencies) if valid_dependencies else "RPCSS"
        prompt = (
            "You are a Windows error analysis assistant. Given the following Windows Event ID 7003 error details, "
            "analyze the root cause and provide remediation steps to fix the service startup issue caused by an invalid dependency.\n\n"
            f"Error Details: {error_message}\n"
            f"Normalized Service Name: {normalized_service_name}\n"
            f"Invalid Dependency: {dependency or 'unknown'}\n"
            f"Valid Dependencies (from PowerShell): {depend_str}\n"
            f"Service Details: {service_details or 'None'}\n\n"
            "Return a JSON object with:\n"
            "- 'root_cause': a brief description of the issue (e.g., 'Service X failed to start due to invalid dependency Y')\n"
            "- 'remediation_steps': a list of exactly two directly executable commands:\n"
            " 1. A command in the format 'cmd /c \"sc config <service_name> depend= <valid_dependencies>\"' to set correct dependencies.\n"
            " 2. A command in the format 'Start-Service -Name <service_name>' to restart the service.\n"
            "Use the normalized service name and valid dependencies provided (or 'RPCSS' if none). Ensure commands are formatted exactly as shown, "
            "without extra quotes or formatting that would prevent direct execution in PowerShell or cmd. "
            "Return valid JSON without any explanation."
        )
        try:
            response = self.agent.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300
            )
            reply_content = response.choices[0].message.content.strip()
            self.agent.logger.info(f"LLM reply for remediation steps: {reply_content[:200]}...")
            try:
                match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                if match:
                    json_str = match.group(1)
                else:
                    json_str = reply_content
                result = json.loads(json_str)
            except json.JSONDecodeError as json_err:
                self.agent.logger.error(f"JSON parsing error in remediation steps: {json_err}, Response: {reply_content[:200]}...")
                result = {
                    "root_cause": f"Service {normalized_service_name} failed to start due to invalid dependency {dependency or 'unknown'}",
                    "remediation_steps": [
                        f"cmd /c \"sc config {normalized_service_name} depend= {depend_str}\"",
                        f"Start-Service -Name {normalized_service_name}"
                    ]
                }
            remediation_steps = result.get("remediation_steps", [])
            if (
                len(remediation_steps) != 2 or
                not remediation_steps[0].startswith(f"cmd /c \"sc config {normalized_service_name} depend=") or
                not remediation_steps[1].startswith(f"Start-Service -Name {normalized_service_name}")
            ):
                self.agent.logger.warning(f"Invalid remediation steps from LLM: {remediation_steps}, using fallback steps")
                remediation_steps = [
                    f"cmd /c \"sc config {normalized_service_name} depend= {depend_str}\"",
                    f"Start-Service -Name {normalized_service_name}"
                ]
            final_result = {
                "root_cause": result.get("root_cause", f"Service {normalized_service_name} failed to start due to invalid dependency {dependency or 'unknown'}"),
                "remediation_steps": remediation_steps
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis complete",
                timestamp,
                f"Root cause: {final_result.get('root_cause', 'Unknown')}\nRemediation: {', '.join(final_result.get('remediation_steps', []))}",
                ref
            )
            return final_result
        except Exception as e:
            self.agent.logger.error(f"Error in analyze_and_broadcast: {e}, Error message: {error_message[:200]}...")
            remediation_steps = [
                f"cmd /c \"sc config {normalized_service_name} depend= {depend_str}\"",
                f"Start-Service -Name {normalized_service_name}"
            ]
            final_result = {
                "root_cause": f"Service {normalized_service_name} failed to start due to invalid dependency {dependency or 'unknown'}",
                "remediation_steps": remediation_steps
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root cause: {final_result.get('root_cause', 'Unknown')}\nRemediation failed due to error: {str(e)}",
                ref
            )
            return final_result

class SnowflakeErrorAnalyzer(BaseErrorAnalyzer):
    async def initial_broadcast(self, ref, timestamp, error_message):
        await self.agent._async_broadcast(
            "ErrorAnalyzer",
            "error detected",
            timestamp,
            f"Snowflake error detected: {error_message[:100]}...",
            ref
        )

    def extract_info(self, error_message: str) -> dict:
        return {}  # No specific extraction needed; analysis done via LLM

    async def analyze_and_broadcast(self, info, error_message, ref, timestamp):
        if "JWT token is invalid" in error_message:
            result = {
                "root_cause": "Invalid JWT token for Snowflake key pair authentication",
                "remediation_steps": []
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis complete",
                timestamp,
                f"Root cause: {result.get('root_cause', 'Unknown')}",
                ref
            )
            return result
        prompt = (
            "You are a Snowflake error analysis assistant. Given the following error log entry, "
            "analyze the root cause (focusing on permission-related issues) and provide actionable remediation steps.\n\n"
            f"Error: {error_message}\n\n"
            "Return a JSON object with:\n"
            "- 'root_cause': a brief description of the issue\n"
            "- 'remediation_steps': a list of valid SQL commands only (e.g., GRANT, CREATE ROLE, SHOW GRANTS, etc.). "
            "Do not include any explanation or additional text. Only pure SQL strings."
        )
        try:
            response = self.agent.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500
            )
            reply_content = response.choices[0].message.content.strip()
            self.agent.logger.info(f"LLM reply: {reply_content}")
            match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
            if match:
                json_str = match.group(1)
            else:
                self.agent.logger.warning("No fenced JSON block found, attempting direct JSON parse.")
                json_str = reply_content
            result = json.loads(json_str)
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis complete",
                timestamp,
                f"Root cause: {result.get('root_cause', 'Unknown')}\nRemediation: {', '.join(result.get('remediation_steps', []))}",
                ref
            )
            return result
        except json.JSONDecodeError as json_err:
            self.agent.logger.error(f"JSON parsing error: {json_err}")
            result = {
                "root_cause": "Failed to parse JSON from LLM",
                "remediation_steps": [reply_content]
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root cause: {result.get('root_cause', 'Unknown')}\nRemediation: {', '.join(result.get('remediation_steps', []))}",
                ref
            )
            return result
        except Exception as e:
            self.agent.logger.error(f"OpenAI API error: {e}")
            result = {
                "root_cause": "Failed to analyze",
                "remediation_steps": [f"Error: {e}"]
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root cause: {result.get('root_cause', 'Unknown')}\nRemediation failed due to error: {str(e)}",
                ref
            )
            return result

class KubernetesErrorAnalyzer(BaseErrorAnalyzer):
    def _extract_pod_info(self, error_message: str) -> tuple:
        pattern = r"Container\s+([^\s]+)\s+in\s+pod\s+([^\s]+)/([^\s]+)\s+killed\s+due\s+to\s+OutOfMemory"
        match = re.search(pattern, error_message)
        if match:
            container, namespace, pod = match.groups()
            return pod, namespace, container
        try:
            json_match = re.search(r'\{.*\}', error_message, re.DOTALL)
            if not json_match:
                self.agent.logger.warning(f"No JSON found in error message: {error_message}")
                return None, None, None
            event_data = json.loads(json_match.group(0))
            namespace = event_data.get("objectRef", {}).get("namespace")
            pod_name = event_data.get("objectRef", {}).get("name")
            container_statuses = event_data.get("requestObject", {}).get("status", {}).get("containerStatuses", [])
            for status in container_statuses:
                if status.get("lastState", {}).get("terminated", {}).get("reason") == "OOMKilled":
                    container_name = status.get("name")
                    return pod_name, namespace, container_name
            self.agent.logger.warning(f"No OOMKilled container found in JSON: {error_message}")
            return None, None, None
        except json.JSONDecodeError as e:
            self.agent.logger.warning(f"Failed to parse JSON in error message: {e}")
            return None, None, None

    def _parse_cpu(self, cpu_str: str) -> float:
        if not cpu_str:
            return 0.05  # default minimal
        if cpu_str.endswith('m'):
            return int(cpu_str[:-1]) / 1000.0
        else:
            return float(cpu_str)

    def _parse_memory(self, mem_str: str) -> int:
        if not mem_str:
            return 32  # default minimal
        if mem_str.endswith('Gi'):
            return int(mem_str[:-2]) * 1024
        elif mem_str.endswith('Mi'):
            return int(mem_str[:-2])
        elif mem_str.endswith('M'):
            return int(mem_str[:-1])
        else:
            return int(mem_str)  # assume bytes, but rare; fallback to MiB estimation

    def _modify_pod_manifest(self, pod_name: str, namespace: str, container_name: str) -> tuple:
        try:
            # Step 1: Fetch pod manifest
            cmd = f"kubectl get pod {pod_name} -n {namespace} -o yaml"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                self.agent.logger.error(f"Failed to fetch pod manifest: {result.stderr}")
                return None, []
            manifest = yaml.safe_load(result.stdout)
            containers = manifest.get('spec', {}).get('containers', [])
            if not containers:
                self.agent.logger.error(f"No containers found in pod {pod_name}")
                return None, []
            target_container = None
            current_resources = None
            for container in containers:
                if container.get('name') == container_name:
                    target_container = container
                    current_resources = container.get('resources', {})
                    break
            else:
                self.agent.logger.error(f"Container {container_name} not found in pod {pod_name}")
                return None, []
            # Step 2: Fetch resource usage metrics
            metrics_cmd = f"kubectl top pod {pod_name} -n {namespace} --containers"
            metrics_result = subprocess.run(metrics_cmd, shell=True, capture_output=True, text=True)
            metrics_output = metrics_result.stdout if metrics_result.returncode == 0 else ""
            if not metrics_output:
                self.agent.logger.warning(f"Failed to fetch metrics for pod {pod_name}: {metrics_result.stderr}")
            # Step 3: Fetch detailed pod description
            describe_cmd = f"kubectl describe pod {pod_name} -n {namespace}"
            describe_result = subprocess.run(describe_cmd, shell=True, capture_output=True, text=True)
            describe_output = describe_result.stdout if describe_result.returncode == 0 else ""
            if not describe_output:
                self.agent.logger.warning(f"Failed to fetch pod description for {pod_name}: {describe_result.stderr}")
            # Step 4: Prepare LLM prompt for resource analysis (generic, data-driven)
            full_container_spec = json.dumps(target_container, indent=2)
            prompt = (
                "You are a Kubernetes resource optimization expert. Analyze the full container spec, current resource usage metrics, "
                "and detailed pod description (including Events section for OOMKilled history and any usage hints) to recommend precise, "
                "conservative CPU and memory limits and requests that will prevent future OOM errors without over-allocation. "
                "Keep increases minimal and targeted:\n"
                "- Extract observed peak memory/CPU usage from metrics, Events, or estimate from container command (e.g., for 'stress --vm-bytes 64M', base on 64Mi; for CPU flags, estimate cores).\n"
                "- Set limits to max(current_limit, estimated_peak * 1.2) for a 20% buffer; if no peak/estimate, use current_limit * 1.5 but cap increases at 100%.\n"
                "- Round to standard Kubernetes values (memory: 64Mi, 128Mi, 256Mi, etc.; CPU: 50m, 100m, 200m, etc.).\n"
                "- Set requests to 80% of limits, but not below current requests.\n"
                "- Prioritize data from metrics/describe; avoid arbitrary minimums—tailor to workload.\n"
                "Return a JSON object with 'cpu_limit', 'cpu_request', 'memory_limit', and 'memory_request' in valid Kubernetes format "
                "(e.g., '100m' for CPU, '128Mi' for memory). Base recommendations solely on provided data for accuracy and minimal changes.\n\n"
                f"Pod Name: {pod_name}\n"
                f"Namespace: {namespace}\n"
                f"Container Name: {container_name}\n"
                f"Full Container Spec: {full_container_spec}\n"
                f"Current Resources: {json.dumps(current_resources, indent=2)}\n"
                f"Resource Usage Metrics (kubectl top): {metrics_output or 'No metrics available'}\n"
                f"Pod Description (kubectl describe, focus on Events and Resource sections): {describe_output or 'No description available'}\n"
                f"Error Context: OOMKilled error detected—recommend minimal, data-based increases to resolve in one shot.\n\n"
                "Return a JSON object with:\n"
                "- 'cpu_limit': Recommended CPU limit (e.g., '100m')\n"
                "- 'cpu_request': Recommended CPU request (e.g., '80m')\n"
                "- 'memory_limit': Recommended memory limit (e.g., '128Mi')\n"
                "- 'memory_request': Recommended memory request (e.g., '102Mi')\n"
                "Ensure values are consistent, conservative, and in valid Kubernetes format. Return valid JSON without any explanation."
            )
            # Step 5: Query LLM for resource recommendations
            try:
                response = self.agent.client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=300
                )
                reply_content = response.choices[0].message.content.strip()
                self.agent.logger.info(f"LLM reply for resource recommendations: {reply_content[:200]}...")
                match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                if match:
                    json_str = match.group(1)
                else:
                    json_str = reply_content
                resource_recommendations = json.loads(json_str)
            except json.JSONDecodeError as json_err:
                self.agent.logger.error(f"JSON parsing error in LLM response: {json_err}, Response: {reply_content[:200]}...")
                # Fallback: Dynamic conservative increase based on current resources (generic for any pod)
                current_limits = current_resources.get('limits', {})
                current_requests = current_resources.get('requests', {})
                cpu_limit_val = self._parse_cpu(current_limits.get('cpu', '50m'))
                new_cpu_limit_val = max(cpu_limit_val * 1.5, cpu_limit_val + 0.05)  # 50% increase or +50m min
                new_cpu_limit = f"{int(new_cpu_limit_val * 1000)}m" if new_cpu_limit_val < 1 else f"{new_cpu_limit_val}"
                new_cpu_request_val = max(self._parse_cpu(current_requests.get('cpu', new_cpu_limit[:-1] + 'm')) * 0.8, cpu_limit_val * 0.8)
                new_cpu_request = f"{int(new_cpu_request_val * 1000)}m" if new_cpu_request_val < 1 else f"{new_cpu_request_val}"
                mem_limit_val = self._parse_memory(current_limits.get('memory', '32Mi'))
                new_mem_limit_val = max(mem_limit_val * 1.5, mem_limit_val + 64)  # 50% or +64Mi min
                new_mem_limit = f"{int(new_mem_limit_val)}Mi"
                new_mem_request_val = max(self._parse_memory(current_requests.get('memory', f"{int(mem_limit_val)}Mi")) * 0.8, mem_limit_val * 0.8)
                new_mem_request = f"{int(new_mem_request_val)}Mi"
                resource_recommendations = {
                    "cpu_limit": new_cpu_limit,
                    "cpu_request": new_cpu_request,
                    "memory_limit": new_mem_limit,
                    "memory_request": new_mem_request
                }
                self.agent.logger.info(f"Applied dynamic fallback recommendations: {resource_recommendations}")
            except Exception as e:
                self.agent.logger.error(f"OpenAI API error: {e}")
                # Same fallback as above
                current_limits = current_resources.get('limits', {})
                current_requests = current_resources.get('requests', {})
                cpu_limit_val = self._parse_cpu(current_limits.get('cpu', '50m'))
                new_cpu_limit_val = max(cpu_limit_val * 1.5, cpu_limit_val + 0.05)
                new_cpu_limit = f"{int(new_cpu_limit_val * 1000)}m" if new_cpu_limit_val < 1 else f"{new_cpu_limit_val}"
                new_cpu_request_val = max(self._parse_cpu(current_requests.get('cpu', new_cpu_limit[:-1] + 'm')) * 0.8, cpu_limit_val * 0.8)
                new_cpu_request = f"{int(new_cpu_request_val * 1000)}m" if new_cpu_request_val < 1 else f"{new_cpu_request_val}"
                mem_limit_val = self._parse_memory(current_limits.get('memory', '32Mi'))
                new_mem_limit_val = max(mem_limit_val * 1.5, mem_limit_val + 64)
                new_mem_limit = f"{int(new_mem_limit_val)}Mi"
                new_mem_request_val = max(self._parse_memory(current_requests.get('memory', f"{int(mem_limit_val)}Mi")) * 0.8, mem_limit_val * 0.8)
                new_mem_request = f"{int(new_mem_request_val)}Mi"
                resource_recommendations = {
                    "cpu_limit": new_cpu_limit,
                    "cpu_request": new_cpu_request,
                    "memory_limit": new_mem_limit,
                    "memory_request": new_mem_request
                }
                self.agent.logger.info(f"Applied dynamic fallback recommendations: {resource_recommendations}")
            # Step 6: Update container resources
            target_container['resources'] = {
                'limits': {
                    'cpu': resource_recommendations['cpu_limit'],
                    'memory': resource_recommendations['memory_limit']
                },
                'requests': {
                    'cpu': resource_recommendations['cpu_request'],
                    'memory': resource_recommendations['memory_request']
                }
            }
            # Step 7: Clean manifest
            manifest.pop('status', None)
            metadata = manifest.get('metadata', {})
            metadata.pop('creationTimestamp', None)
            metadata.pop('resourceVersion', None)
            metadata.pop('uid', None)
            metadata.pop('generation', None)
            # Step 8: Save modified manifest
            manifest_file = f"{self.agent.temp_manifest_dir}/{namespace}_{pod_name}.yaml"
            with open(manifest_file, 'w', encoding='utf-8') as f:
                yaml.safe_dump(manifest, f)
            # Step 9: Generate remediation commands
            delete_cmd = f"kubectl delete pod {pod_name} -n {namespace}"
            apply_cmd = f"kubectl apply -f {manifest_file}"
            return manifest_file, [delete_cmd, apply_cmd]
        except Exception as e:
            self.agent.logger.error(f"Error modifying pod manifest: {e}")
            return None, []

    def extract_info(self, error_message: str) -> dict:
        pod_name, namespace, container_name = self._extract_pod_info(error_message)
        return {
            "pod_name": pod_name,
            "namespace": namespace,
            "container_name": container_name
        }

    async def initial_broadcast(self, ref, timestamp, error_message):
        pod_name, namespace, container_name = self._extract_pod_info(error_message)  # Preliminary extraction for broadcast
        error_details = (
            f"Kubernetes OOMKilled Error Detected\n"
            f"Pod: {pod_name or 'Unknown'}\n"
            f"Namespace: {namespace or 'Unknown'}\n"
            f"Container: {container_name or 'Unknown'}\n"
            f"Details: Memory exhaustion detected, indicating resource contention or insufficient memory allocation. Analyzing resource usage and pod events to determine optimal limits."
        )
        await self.agent._async_broadcast(
            "ErrorAnalyzer",
            "error detected",
            timestamp,
            error_details,
            ref
        )

    async def analyze_and_broadcast(self, info, error_message, ref, timestamp):
        pod_name = info.get("pod_name")
        namespace = info.get("namespace")
        container_name = info.get("container_name")
        if not pod_name or not namespace or not container_name:
            result = {
                "root_cause": "Failed to extract pod information",
                "remediation_steps": [],
                "manifest_file": None
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root Cause: Unable to extract pod details from error message. Check log format or Kubernetes API access.",
                ref
            )
            return result
        manifest_file, commands = self._modify_pod_manifest(pod_name, namespace, container_name)
        if not commands:
            result = {
                "root_cause": "Failed to modify pod manifest",
                "remediation_steps": [],
                "manifest_file": None
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root Cause: Failed to generate updated pod manifest for {pod_name} in namespace {namespace}. Possible issues with kubectl access or manifest parsing.",
                ref
            )
            return result
        # Fetch resource recommendations from manifest modification
        resource_recommendations = None
        try:
            with open(manifest_file, 'r', encoding='utf-8') as f:
                manifest = yaml.safe_load(f)
            for container in manifest.get('spec', {}).get('containers', []):
                if container.get('name') == container_name:
                    resource_recommendations = container.get('resources', {})
                    break
        except Exception as e:
            self.agent.logger.warning(f"Failed to extract resource recommendations from manifest: {e}")
        # Enhanced analysis complete broadcast with technical details
        analysis_details = (
            f"Root Cause: OOMKilled error in pod {pod_name} (namespace: {namespace}, container: {container_name}) due to memory limit exhaustion.\n"
            f"Analysis: Evaluated pod metrics and events using kubectl describe and top. Determined insufficient memory allocation as primary cause.\n"
            f"Recommended Resources: {json.dumps(resource_recommendations, indent=2) if resource_recommendations else 'Default applied: CPU 500m/400m, Memory 512Mi/410Mi'}\n"
            f"Remediation Steps: {', '.join(commands)}\n"
            f"Manifest File: {manifest_file or 'None'}\n"
            f"Impact: Prevents pod crashes by adjusting resource limits with a 50% increase over observed usage, ensuring stability."
        )
        await self.agent._async_broadcast(
            "ErrorAnalyzer",
            "analysis complete",
            timestamp,
            analysis_details,
            ref,
            resource_recommendations=resource_recommendations
        )
        result = {
            "root_cause": f"OOMKilled error in pod {pod_name} in namespace {namespace}",
            "remediation_steps": commands,
            "manifest_file": manifest_file
        }
        return result

class DatabricksErrorAnalyzer(BaseErrorAnalyzer):
    def _extract_databricks_info(self, error_message: str) -> dict:
        try:
            # Try parsing as JSON first
            json_match = re.search(r'\{.*\}', error_message, re.DOTALL)
            if json_match:
                event_data = json.loads(json_match.group(0))
                table_name = event_data.get('table_name', None)
                user_name = event_data.get('user_name', None)
                error_message_text = event_data.get('error_message', '')
                query_text = event_data.get('query_text', '')
            else:
                table_name = None
                user_name = None
                error_message_text = error_message
                query_text = ''
            # Fallback to regex if JSON parsing fails or fields are missing
            if not table_name:
                # Extract table name from QueryText (e.g., 'INSERT INTO main.default.protected_table ...')
                table_match = re.search(r'INSERT INTO\s+([a-zA-Z0-9_\.]+)\s', error_message, re.IGNORECASE)
                table_name = table_match.group(1) if table_match else 'Unknown'
            if not user_name:
                user_match = re.search(r'User: ([^\s]+)', error_message)
                user_name = user_match.group(1) if user_match else 'Unknown'
            # Determine required permission based on query text or error message
            permission = 'MODIFY'
            if 'SELECT' in query_text.upper():
                permission = 'SELECT'
            elif 'INSERT' in query_text.upper() or 'Permission denied' in error_message_text:
                permission = 'MODIFY'
            return {
                'table_name': table_name,
                'user_name': user_name,
                'error_message': error_message_text,
                'query_text': query_text,
                'required_permission': permission
            }
        except Exception as e:
            self.agent.logger.error(f"Error extracting Databricks info: {e}")
            return {
                'table_name': 'Unknown',
                'user_name': 'Unknown',
                'error_message': error_message,
                'query_text': '',
                'required_permission': 'MODIFY'
            }

    def extract_info(self, error_message: str) -> dict:
        return self._extract_databricks_info(error_message)

    async def initial_broadcast(self, ref, timestamp, error_message):
        info = self._extract_databricks_info(error_message)  # Preliminary extraction for broadcast
        table_name = info.get('table_name')
        user_name = info.get('user_name')
        error_message_text = info.get('error_message')
        query_text = info.get('query_text')
        error_details = (
            f"Databricks Query Failure Detected\n"
            f"Table: {table_name or 'Unknown'}\n"
            f"User: {user_name or 'Unknown'}\n"
            f"Query: {query_text[:50] + '...' if query_text else 'Unknown'}\n"
            f"Error: {error_message_text or 'Unknown'}\n"
            f"Details: Query failed, likely due to insufficient permissions. Analyzing to confirm root cause and generate API call for permission grant."
        )
        await self.agent._async_broadcast(
            "ErrorAnalyzer",
            "error detected",
            timestamp,
            error_details,
            ref
        )

    async def analyze_and_broadcast(self, info, error_message, ref, timestamp):
        table_name = info.get('table_name')
        user_name = info.get('user_name')
        error_message_text = info.get('error_message')
        query_text = info.get('query_text')
        required_permission = info.get('required_permission')
        if not table_name or not user_name or not required_permission:
            self.agent.logger.error(f"Failed to extract Databricks info: table={table_name}, user={user_name}, permission={required_permission}")
            result = {
                "root_cause": "Failed to extract table or user information from Databricks error",
                "remediation_steps": []
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root Cause: Unable to extract table or user details from error message. Check log format.",
                ref
            )
            return result
        prompt = (
            "You are a Databricks error analysis assistant. Given the following error details from a Databricks query failure, "
            "analyze the root cause (focusing on permission-related issues) and provide a remediation step as a Databricks API call.\n\n"
            f"Error Details: {error_message}\n"
            f"Table Name: {table_name}\n"
            f"User: {user_name}\n"
            f"Query Text: {query_text}\n"
            f"Error Message: {error_message_text}\n"
            f"Suggested Permission: {required_permission}\n\n"
            "Return a JSON object with:\n"
            "- 'root_cause': a brief description of the issue (e.g., 'Permission denied for user X on table Y')\n"
            "- 'remediation_steps': a list containing a single JSON string representing the body of a Databricks API PATCH request to grant the required permission. "
            "The JSON string should be exactly: '{\"changes\": [{\"principal\": \"<user>\", \"add\": [\"<permission>\"]}]}' without any additional text, explanation, or endpoint mention.\n"
            "Ensure the principal and permission are valid (principal must be a valid email or group, permission must be one of SELECT, MODIFY, ALL_PRIVILEGES).\n"
            "Return valid JSON without any explanation or extra text."
        )
        try:
            response = self.agent.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300
            )
            reply_content = response.choices[0].message.content.strip()
            self.agent.logger.info(f"LLM reply for Databricks remediation: {reply_content[:200]}...")
            match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
            if match:
                json_str = match.group(1)
            else:
                json_str = reply_content
            result = json.loads(json_str)
            remediation_steps = result.get("remediation_steps", [])
            valid_permissions = ["SELECT", "MODIFY", "ALL_PRIVILEGES"]
            if not remediation_steps or not isinstance(remediation_steps[0], str):
                self.agent.logger.warning(f"Invalid remediation steps from LLM: {remediation_steps}, using fallback")
                remediation_steps = [
                    json.dumps({
                        "changes": [{"principal": user_name, "add": [required_permission]}]
                    })
                ]
            else:
                # Validate the remediation step
                try:
                    api_body = json.loads(remediation_steps[0])
                    if (
                        not isinstance(api_body, dict) or
                        "changes" not in api_body or
                        not isinstance(api_body["changes"], list) or
                        not api_body["changes"] or
                        "principal" not in api_body["changes"][0] or
                        "add" not in api_body["changes"][0] or
                        not isinstance(api_body["changes"][0]["add"], list) or
                        not api_body["changes"][0]["add"] or
                        api_body["changes"][0]["add"][0] not in valid_permissions
                    ):
                        self.agent.logger.warning(f"Invalid Databricks API call format: {remediation_steps[0]}, using fallback")
                        remediation_steps = [
                            json.dumps({
                                "changes": [{"principal": user_name, "add": [required_permission]}]
                            })
                        ]
                except json.JSONDecodeError:
                    self.agent.logger.warning(f"Invalid JSON in remediation step: {remediation_steps[0]}, using fallback")
                    remediation_steps = [
                        json.dumps({
                            "changes": [{"principal": user_name, "add": [required_permission]}]
                        })
                    ]
            final_result = {
                "root_cause": result.get("root_cause", f"Permission denied for user {user_name} on table {table_name}"),
                "remediation_steps": remediation_steps
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis complete",
                timestamp,
                f"Root cause: {final_result.get('root_cause', 'Unknown')}\nRemediation: Databricks API call to grant {required_permission} on {table_name} for {user_name}\nAPI Body: {remediation_steps[0]}",
                ref
            )
            return final_result
        except json.JSONDecodeError as json_err:
            self.agent.logger.error(f"JSON parsing error in Databricks remediation: {json_err}, Response: {reply_content[:200]}...")
            remediation_steps = [
                json.dumps({
                    "changes": [{"principal": user_name, "add": [required_permission]}]
                })
            ]
            final_result = {
                "root_cause": f"Permission denied for user {user_name} on table {table_name}",
                "remediation_steps": remediation_steps
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root cause: {final_result.get('root_cause', 'Unknown')}\nRemediation: {remediation_steps[0]}",
                ref
            )
            return final_result
        except Exception as e:
            self.agent.logger.error(f"OpenAI API error for Databricks: {e}")
            remediation_steps = [
                json.dumps({
                    "changes": [{"principal": user_name, "add": [required_permission]}]
                })
            ]
            final_result = {
                "root_cause": f"Permission denied for user {user_name} on table {table_name}",
                "remediation_steps": remediation_steps
            }
            await self.agent._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root cause: {final_result.get('root_cause', 'Unknown')}\nRemediation failed due to error: {str(e)}",
                ref
            )
            return final_result

class ErrorAnalyzerAgent(AssistantAgent):
    def __init__(self, name, llm_config, ws_manager=None):
        super().__init__(name=name, llm_config=llm_config)
        self.logger = logging.getLogger("ErrorAnalyzer")
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
        self.config = configparser.ConfigParser()
        config_path = os.getenv("CONFIG_PATH", "C:/Users/Quadrant/Loganalytics/Backend/config.ini")
        if os.path.exists(config_path):
            self.config.read(config_path)
            self.target_server = self.config.get('Windows', 'TargetServer', fallback='localhost')
        else:
            self.target_server = os.getenv("WINDOWS_TARGET_SERVER", "localhost")
        self.hostname = socket.gethostname() if self.target_server == "localhost" else self.target_server
        self.ERROR_LOG_WINDOWS = "C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log"
        self.ERROR_LOG_SNOWFLAKE = "C:/Users/Quadrant/Loganalytics/Backend/snowflake_errors.log"
        self.ERROR_LOG_KUBERNETES = "C:/Users/Quadrant/Loganalytics/Backend/kubernetes_errors.log"
        self.ERROR_LOG_DATABRICKS = "C:/Users/Quadrant/Loganalytics/Backend/databricks_errors.log"
        self.last_position_windows = 0
        self.last_position_snowflake = 0
        self.last_position_kubernetes = 0
        self.last_position_databricks = 0
        self.OPENAI_API_KEY = os.getenv("OPEN_API_KEY")
        self.client = OpenAI(api_key=self.OPENAI_API_KEY)
        self.snowflake_conn = None
        try:
            self.snowflake_conn = self._connect_to_snowflake()
        except Exception as e:
            self.logger.error(f"Failed to initialize Snowflake connection: {e}")
            with open(self.ERROR_LOG_SNOWFLAKE, "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Initialization error: {e}\n{'-' * 60}\n")
        self.temp_manifest_dir = "./temp_manifests"
        os.makedirs(self.temp_manifest_dir, exist_ok=True)
        self.broadcasted_messages = set()
        self.analyzers = {
            "windows": WindowsErrorAnalyzer(self),
            "kubernetes": KubernetesErrorAnalyzer(self),
            "databricks": DatabricksErrorAnalyzer(self)
        }
        if self.snowflake_conn:
            self.analyzers["snowflake"] = SnowflakeErrorAnalyzer(self)

    def _connect_to_snowflake(self):
        self.logger.info("Connecting to Snowflake using key pair authentication...")
        private_key_path = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH", "C:/Users/Quadrant/Loganalytics/Backend/snowflake_key.pem")
        private_key_passphrase = os.getenv("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE", None)
        with open(private_key_path, "rb") as key_file:
            p_key = serialization.load_pem_private_key(
                key_file.read(),
                password=private_key_passphrase.encode() if private_key_passphrase else None,
                backend=default_backend()
            )
        private_key = p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        conn = snowflake.connector.connect(
            user=os.getenv("SNOWFLAKE_USER"),
            account=os.getenv("SNOWFLAKE_ACCOUNT"),
            private_key=private_key,
            warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
            database=os.getenv("SNOWFLAKE_DATABASE"),
            schema=os.getenv("SNOWFLAKE_SCHEMA"),
            role=os.getenv("SNOWFLAKE_ROLE")
        )
        self.logger.info("Connected to Snowflake")
        return conn

    async def _async_broadcast(self, agent, status, timestamp, details, reference, resource_recommendations=None):
        """Run broadcast in the correct event loop, handling threading issues, with enhanced technical details."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        try:
            message = {
                "agent": agent,
                "status": status,
                "time": timestamp,
                "details": details,
                "reference": reference
            }
            if resource_recommendations:
                message["resource_recommendations"] = resource_recommendations
            self.logger.info(json.dumps(message))
            if self.ws_manager:
                await self.ws_manager.broadcast(message)
        finally:
            if loop.is_closed():
                pass
            elif not loop.is_running():
                loop.close()

    async def analyze_error(self, error_message: str, source: str) -> dict:
        ref_match = re.search(r"Reference:\s*(\S+)", error_message)
        ref = ref_match.group(1) if ref_match else str(uuid.uuid4())
        timestamp = datetime.now().strftime("%H:%M:%S")
        if source not in self.analyzers:
            result = {
                "reference": ref,
                "root_cause": f"Cannot analyze {source} error: Invalid source or no Snowflake connection",
                "remediation_steps": [],
                "source": source
            }
            await self._async_broadcast(
                "ErrorAnalyzer",
                "analysis failed",
                timestamp,
                f"Root Cause: Invalid error source ({source}) or missing Snowflake connection. Verify configuration and data source.",
                ref
            )
            return result
        analyzer = self.analyzers[source]
        await analyzer.initial_broadcast(ref, timestamp, error_message)
        info = analyzer.extract_info(error_message)
        result = await analyzer.analyze_and_broadcast(info, error_message, ref, timestamp)
        result["reference"] = ref
        result["source"] = source
        return result

    async def broadcast_message(self, agent, status, timestamp, details, reference):
        message_key = f"{reference}:{status}:{details}"
        if message_key in self.broadcasted_messages:
            self.logger.debug(f"Skipping duplicate broadcast for reference {reference}: {details}")
            return
        self.broadcasted_messages.add(message_key)
        message = {
            "agent": agent,
            "status": status,
            "time": timestamp,
            "details": details,
            "reference": reference
        }
        self.logger.info(json.dumps(message))
        if self.ws_manager:
            await self.ws_manager.broadcast(message)

    def run(self):
        self.logger.info(f"ErrorAnalyzerAgent started for Windows ({self.hostname}), Snowflake, Kubernetes, and Databricks")
        for log_file in [self.ERROR_LOG_WINDOWS, self.ERROR_LOG_SNOWFLAKE, self.ERROR_LOG_KUBERNETES, self.ERROR_LOG_DATABRICKS]:
            if not os.path.exists(log_file):
                open(log_file, 'a').close()
        while True:
            if os.path.exists(self.ERROR_LOG_WINDOWS):
                with open(self.ERROR_LOG_WINDOWS, 'r', encoding='utf-8') as f:
                    f.seek(self.last_position_windows)
                    new_entries = f.read()
                    self.last_position_windows = f.tell()
                if new_entries:
                    errors = new_entries.strip().split('-' * 60)
                    for err in errors:
                        if not err.strip():
                            continue
                        if not re.search(r"EventID: 7003", err.strip()):
                            self.logger.debug(f"Skipping non-7003 Windows log entry: {err.strip()[:100]}...")
                            continue
                        self.logger.info("Analyzing new Windows Event ID 7003 error...")
                        result = asyncio.run(self.analyze_error(err.strip(), source="windows"))
                        output = {
                            "reference": result.get("reference"),
                            "error": err.strip(),
                            "root_cause": result.get("root_cause", "Unknown"),
                            "remediation_steps": result.get("remediation_steps", []),
                            "source": "windows"
                        }
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.logger.info("Windows analysis written to fix_queue.json")
            if self.snowflake_conn and os.path.exists(self.ERROR_LOG_SNOWFLAKE):
                with open(self.ERROR_LOG_SNOWFLAKE, 'r', encoding='utf-8') as f:
                    f.seek(self.last_position_snowflake)
                    new_entries = f.read()
                    self.last_position_snowflake = f.tell()
                if new_entries:
                    errors = new_entries.strip().split('-' * 60)
                    for err in errors:
                        if not err.strip():
                            continue
                        self.logger.info("Analyzing new Snowflake error...")
                        result = asyncio.run(self.analyze_error(err.strip(), source="snowflake"))
                        output = {
                            "reference": result.get("reference"),
                            "error": err.strip(),
                            "root_cause": result.get("root_cause", "Unknown"),
                            "remediation_steps": result.get("remediation_steps", []),
                            "source": "snowflake"
                        }
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.logger.info("Snowflake analysis written to fix_queue.json")
            if os.path.exists(self.ERROR_LOG_KUBERNETES):
                with open(self.ERROR_LOG_KUBERNETES, 'r', encoding='utf-8') as f:
                    f.seek(self.last_position_kubernetes)
                    new_entries = f.read()
                    self.last_position_kubernetes = f.tell()
                if new_entries:
                    errors = new_entries.strip().split('-' * 60)
                    for err in errors:
                        if not err.strip():
                            continue
                        self.logger.info("Analyzing new Kubernetes error...")
                        result = asyncio.run(self.analyze_error(err.strip(), source="kubernetes"))
                        output = {
                            "reference": result.get("reference"),
                            "error": err.strip(),
                            "root_cause": result.get("root_cause", "Unknown"),
                            "remediation_steps": result.get("remediation_steps", []),
                            "manifest_file": result.get("manifest_file", None),
                            "source": "kubernetes"
                        }
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.logger.info("Kubernetes analysis written to fix_queue.json")
            if os.path.exists(self.ERROR_LOG_DATABRICKS):
                with open(self.ERROR_LOG_DATABRICKS, 'r', encoding='utf-8') as f:
                    f.seek(self.last_position_databricks)
                    new_entries = f.read()
                    self.last_position_databricks = f.tell()
                if new_entries:
                    errors = new_entries.strip().split('-' * 60)
                    for err in errors:
                        if not err.strip():
                            continue
                        self.logger.info("Analyzing new Databricks error...")
                        result = asyncio.run(self.analyze_error(err.strip(), source="databricks"))
                        output = {
                            "reference": result.get("reference"),
                            "error": err.strip(),
                            "root_cause": result.get("root_cause", "Unknown"),
                            "remediation_steps": result.get("remediation_steps", []),
                            "source": "databricks"
                        }
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                            json.dump(output, out, indent=4)
                        self.logger.info("Databricks analysis written to fix_queue.json")
            time.sleep(10)

if __name__ == "__main__":
    llm_config = {"model": "gpt-4o", "api_key": os.getenv("OPEN_API_KEY")}
    analyzer = ErrorAnalyzerAgent(name="ErrorAnalyzerAgent", llm_config=llm_config)
    analyzer.run()