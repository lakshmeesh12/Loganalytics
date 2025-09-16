# agent.py
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

load_dotenv()

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
        self.ws_manager = ws_manager  # WebSocket connection manager
        # Windows configuration
        self.config = configparser.ConfigParser()
        config_path = os.getenv("CONFIG_PATH", "C:/Users/Quadrant/Loganalytics/Backend/config.ini")
        if os.path.exists(config_path):
            self.config.read(config_path)
            self.target_server = self.config.get('Windows', 'TargetServer', fallback='localhost')
        else:
            self.target_server = os.getenv("WINDOWS_TARGET_SERVER", "localhost")
        self.hostname = socket.gethostname() if self.target_server == "localhost" else self.target_server
        self.ERROR_LOG_WINDOWS = "C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log"
        self.last_position_windows = 0
        # Snowflake configuration
        self.OPENAI_API_KEY = os.getenv("OPEN_API_KEY")
        self.client = OpenAI(api_key=self.OPENAI_API_KEY)
        self.snowflake_conn = None
        try:
            self.snowflake_conn = self._connect_to_snowflake()
        except Exception as e:
            self.logger.error(f"Failed to initialize Snowflake connection: {e}")
            with open("C:/Users/Quadrant/Loganalytics/Backend/snowflake_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Initialization error: {e}\n{'-' * 60}\n")
        self.ERROR_LOG_SNOWFLAKE = "C:/Users/Quadrant/Loganalytics/Backend/snowflake_errors.log"
        self.last_position_snowflake = 0
        # Kubernetes configuration
        self.ERROR_LOG_KUBERNETES = "C:/Users/Quadrant/Loganalytics/Backend/kubernetes_errors.log"
        self.last_position_kubernetes = 0
        self.temp_manifest_dir = "./temp_manifests"
        os.makedirs(self.temp_manifest_dir, exist_ok=True)

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

    def _execute_powershell_command(self, command: str, remote: bool = False) -> str:
        """Execute a PowerShell command locally or remotely, returning the output."""
        try:
            if remote and self.target_server != "localhost":
                cmd = (
                    f"powershell -Command \"Invoke-Command -ComputerName {self.target_server} -ScriptBlock {{{command}}}\""
                )
            else:
                cmd = f"powershell -Command \"{command}\""
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if result.returncode == 0:
                self.logger.info(f"Executed PowerShell command: {command}")
                return result.stdout.strip()
            else:
                self.logger.error(f"Failed to execute PowerShell command: {command}, Error: {result.stderr}")
                return ""
        except Exception as e:
            self.logger.error(f"Error executing PowerShell command: {command}, Error: {e}")
            return ""

    def _extract_windows_service_info(self, error_message: str) -> dict:
        """Extract detailed information for Windows Event ID 7003 error using multi-stage LLM and PowerShell."""
        if not re.search(r"EventID: 7003", error_message):
            self.logger.debug(f"Skipping non-7003 error log entry: {error_message[:100]}...")
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
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=200
            )
            reply_content = response.choices[0].message.content.strip()
            self.logger.info(f"LLM reply for Windows error (Step 1): {reply_content[:200]}...")

            try:
                match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                if match:
                    json_str = match.group(1)
                else:
                    json_str = reply_content
                result = json.loads(json_str)
            except json.JSONDecodeError as json_err:
                self.logger.error(f"JSON parsing error in LLM response: {json_err}, Response: {reply_content[:200]}...")
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
                    self.logger.error(f"Failed to parse error_message as JSON: {error_message[:200]}...")
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
                self.logger.info("Incomplete information extracted, querying event log for details.")
                ps_command = (
                    f"Get-WinEvent -LogName System -MaxEvents 100 | "
                    f"Where-Object {{ $_.Id -eq 7003 -and $_.ProviderName -eq 'Service Control Manager' }} | "
                    f"Select-Object -First 1 -Property TimeCreated,Message,RecordNumber,MachineName | "
                    f"Format-List | Out-String"
                )
                event_details = self._execute_powershell_command(ps_command, remote=(self.target_server != "localhost"))
                if event_details:
                    self.logger.info(f"Retrieved event log details: {event_details[:200]}...")
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
                        response = self.client.chat.completions.create(
                            model="gpt-4o",
                            messages=[
                                {"role": "system", "content": "You are a helpful assistant."},
                                {"role": "user", "content": enriched_prompt}
                            ],
                            max_tokens=300
                        )
                        reply_content = response.choices[0].message.content.strip()
                        self.logger.info(f"LLM reply for Windows error (Step 3): {reply_content[:200]}...")

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
                        self.logger.error(f"JSON parsing error in enriched LLM response: {json_err}, Response: {reply_content[:200]}...")
                    except Exception as e:
                        self.logger.error(f"OpenAI API error in enriched prompt: {e}")

            if enriched_info["service_name"]:
                ps_command = f"Get-Service -Name '{enriched_info['service_name']}' -ErrorAction SilentlyContinue | Select-Object -Property Name,Status,DependentServices,ServicesDependedOn | Format-List | Out-String"
                service_details = self._execute_powershell_command(ps_command, remote=(self.target_server != "localhost"))
                if service_details:
                    self.logger.info(f"Retrieved service details for {enriched_info['service_name']}: {service_details[:200]}...")
                    enriched_info["service_details"] = service_details
                else:
                    self.logger.warning(f"Failed to retrieve service details for {enriched_info['service_name']}")
                    enriched_info["service_details"] = None
            else:
                enriched_info["service_details"] = None

            return enriched_info
        except Exception as e:
            self.logger.error(f"Error in _extract_windows_service_info: {e}, Error message: {error_message[:200]}...")
            return {
                "service_name": None,
                "dependency": None,
                "computer_name": None,
                "time_generated": None,
                "record_number": None,
                "service_details": None
            }

    def _get_service_dependencies(self, service_name: str) -> list:
        try:
            cmd = f"sc qc {service_name}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                self.logger.error(f"Failed to query service {service_name}: {result.stderr}")
                return []
            output = result.stdout
            depend_match = re.search(r"DEPENDENCIES\s*:\s*(.*?)\s*(?:BINARY_PATH_NAME|$)", output, re.DOTALL)
            if depend_match:
                dependencies = depend_match.group(1).strip().split()
                return [dep for dep in dependencies if dep]
            return []
        except Exception as e:
            self.logger.error(f"Error querying dependencies for {service_name}: {e}")
            return []

    def _extract_pod_info(self, error_message: str) -> tuple:
        pattern = r"Container\s+([^\s]+)\s+in\s+pod\s+([^\s]+)/([^\s]+)\s+killed\s+due\s+to\s+OutOfMemory"
        match = re.search(pattern, error_message)
        if match:
            container, namespace, pod = match.groups()
            return pod, namespace, container

        try:
            json_match = re.search(r'\{.*\}', error_message, re.DOTALL)
            if not json_match:
                self.logger.warning(f"No JSON found in error message: {error_message}")
                return None, None, None

            event_data = json.loads(json_match.group(0))
            namespace = event_data.get("objectRef", {}).get("namespace")
            pod_name = event_data.get("objectRef", {}).get("name")
            container_statuses = event_data.get("requestObject", {}).get("status", {}).get("containerStatuses", [])
            for status in container_statuses:
                if status.get("lastState", {}).get("terminated", {}).get("reason") == "OOMKilled":
                    container_name = status.get("name")
                    return pod_name, namespace, container_name

            self.logger.warning(f"No OOMKilled container found in JSON: {error_message}")
            return None, None, None
        except json.JSONDecodeError as e:
            self.logger.warning(f"Failed to parse JSON in error message: {e}")
            return None, None, None

    def _modify_pod_manifest(self, pod_name: str, namespace: str, container_name: str) -> tuple:
        try:
            cmd = f"kubectl get pod {pod_name} -n {namespace} -o yaml"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                self.logger.error(f"Failed to fetch pod manifest: {result.stderr}")
                return None, []

            manifest = yaml.safe_load(result.stdout)
            containers = manifest.get('spec', {}).get('containers', [])
            if not containers:
                self.logger.error(f"No containers found in pod {pod_name}")
                return None, []

            for container in containers:
                if container.get('name') == container_name:
                    resources = container.setdefault('resources', {})
                    limits = resources.setdefault('limits', {})
                    requests = resources.setdefault('requests', {})

                    cpu_limit = limits.get('cpu', '500m')
                    memory_limit = limits.get('memory', '512Mi')
                    cpu_request = requests.get('cpu', '250m')
                    memory_request = requests.get('memory', '256Mi')

                    if 'm' in cpu_limit:
                        cpu_val = int(cpu_limit.replace('m', '')) * 2
                        limits['cpu'] = f"{cpu_val}m"
                        requests['cpu'] = f"{cpu_val // 2}m"
                    else:
                        cpu_val = float(cpu_limit) * 2
                        limits['cpu'] = f"{cpu_val}"
                        requests['cpu'] = f"{cpu_val / 2}"

                    if 'Mi' in memory_limit:
                        mem_val = int(memory_limit.replace('Mi', '')) * 2
                        limits['memory'] = f"{mem_val}Mi"
                        requests['memory'] = f"{mem_val // 2}Mi"
                    elif 'Gi' in memory_limit:
                        mem_val = float(memory_limit.replace('Gi', '')) * 2
                        limits['memory'] = f"{mem_val}Gi"
                        requests['memory'] = f"{mem_val / 2}Gi"
                    break
            else:
                self.logger.error(f"Container {container_name} not found in pod {pod_name}")
                return None, []

            manifest.pop('status', None)
            metadata = manifest.get('metadata', {})
            metadata.pop('creationTimestamp', None)
            metadata.pop('resourceVersion', None)
            metadata.pop('uid', None)
            metadata.pop('generation', None)

            manifest_file = f"{self.temp_manifest_dir}/{namespace}_{pod_name}.yaml"
            with open(manifest_file, 'w', encoding='utf-8') as f:
                yaml.safe_dump(manifest, f)

            delete_cmd = f"kubectl delete pod {pod_name} -n {namespace}"
            apply_cmd = f"kubectl apply -f {manifest_file}"
            return manifest_file, [delete_cmd, apply_cmd]

        except Exception as e:
            self.logger.error(f"Error modifying pod manifest: {e}")
            return None, []

    async def broadcast_message(self, agent, status, timestamp, details, reference):
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

    async def _async_broadcast(self, agent, status, timestamp, details, reference):
        await self.broadcast_message(agent, status, timestamp, details, reference)

    def analyze_error(self, error_message: str, source: str) -> dict:
        ref_match = re.search(r"Reference:\s*(\S+)", error_message)
        ref = ref_match.group(1) if ref_match else str(uuid.uuid4())

        if source == "windows":
            info = self._extract_windows_service_info(error_message)
            service_name = info.get("service_name")
            dependency = info.get("dependency")
            computer_name = info.get("computer_name")
            time_generated = info.get("time_generated")
            service_details = info.get("service_details")

            if not service_name:
                self.logger.error(f"Failed to extract service name from error: {error_message[:200]}...")
                result = {
                    "reference": ref,
                    "root_cause": "Failed to extract service information",
                    "remediation_steps": [],
                    "source": "windows"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {result.get('root_cause', 'Unknown')}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return result

            normalized_service_name = service_name
            ps_command = f"Get-Service -DisplayName '{service_name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"
            service_name_result = self._execute_powershell_command(ps_command, remote=(self.target_server != "localhost"))
            if service_name_result:
                normalized_service_name = service_name_result.strip()
                self.logger.info(f"Normalized service name from '{service_name}' to '{normalized_service_name}'")
            else:
                self.logger.warning(f"Failed to normalize service name '{service_name}', using original name")

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
                "  1. A command in the format 'cmd /c \"sc config <service_name> depend= <valid_dependencies>\"' to set correct dependencies.\n"
                "  2. A command in the format 'Start-Service -Name <service_name>' to restart the service.\n"
                "Use the normalized service name and valid dependencies provided (or 'RPCSS' if none). Ensure commands are formatted exactly as shown, "
                "without extra quotes or formatting that would prevent direct execution in PowerShell or cmd. "
                "Return valid JSON without any explanation."
            )
            try:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=300
                )
                reply_content = response.choices[0].message.content.strip()
                self.logger.info(f"LLM reply for remediation steps: {reply_content[:200]}...")

                try:
                    match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                    if match:
                        json_str = match.group(1)
                    else:
                        json_str = reply_content
                    result = json.loads(json_str)
                except json.JSONDecodeError as json_err:
                    self.logger.error(f"JSON parsing error in remediation steps: {json_err}, Response: {reply_content[:200]}...")
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
                    self.logger.warning(f"Invalid remediation steps from LLM: {remediation_steps}, using fallback steps")
                    remediation_steps = [
                        f"cmd /c \"sc config {normalized_service_name} depend= {depend_str}\"",
                        f"Start-Service -Name {normalized_service_name}"
                    ]

                final_result = {
                    "reference": ref,
                    "root_cause": result.get("root_cause", f"Service {normalized_service_name} failed to start due to invalid dependency {dependency or 'unknown'}"),
                    "remediation_steps": remediation_steps,
                    "source": "windows"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {final_result.get('root_cause', 'Unknown')}\nRemediation steps: {', '.join(final_result.get('remediation_steps', []))}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return final_result
            except Exception as e:
                self.logger.error(f"Error in analyze_error: {e}, Error message: {error_message[:200]}...")
                remediation_steps = [
                    f"cmd /c \"sc config {normalized_service_name} depend= {depend_str}\"",
                    f"Start-Service -Name {normalized_service_name}"
                ]
                final_result = {
                    "reference": ref,
                    "root_cause": f"Service {normalized_service_name} failed to start due to invalid dependency {dependency or 'unknown'}",
                    "remediation_steps": remediation_steps,
                    "source": "windows"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {final_result.get('root_cause', 'Unknown')}\nRemediation steps: {', '.join(final_result.get('remediation_steps', []))}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return final_result
        elif source == "snowflake" and self.snowflake_conn:
            if "JWT token is invalid" in error_message:
                result = {
                    "reference": ref,
                    "root_cause": "Invalid JWT token for Snowflake key pair authentication",
                    "remediation_steps": [],
                    "source": "snowflake"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {result.get('root_cause', 'Unknown')}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
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
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=500
                )
                reply_content = response.choices[0].message.content.strip()
                self.logger.info(f"LLM reply: {reply_content}")

                match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                if match:
                    json_str = match.group(1)
                else:
                    self.logger.warning("No fenced JSON block found, attempting direct JSON parse.")
                    json_str = reply_content

                result = json.loads(json_str)
                result["reference"] = ref
                result["source"] = "snowflake"
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {result.get('root_cause', 'Unknown')}\nRemediation steps: {', '.join(result.get('remediation_steps', []))}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return result
            except json.JSONDecodeError as json_err:
                self.logger.error(f"JSON parsing error: {json_err}")
                result = {
                    "reference": ref,
                    "root_cause": "Failed to parse JSON from LLM",
                    "remediation_steps": [reply_content],
                    "source": "snowflake"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {result.get('root_cause', 'Unknown')}\nRemediation steps: {', '.join(result.get('remediation_steps', []))}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return result
            except Exception as e:
                self.logger.error(f"OpenAI API error: {e}")
                result = {
                    "reference": ref,
                    "root_cause": "Failed to analyze",
                    "remediation_steps": [f"Error: {e}"],
                    "source": "snowflake"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {result.get('root_cause', 'Unknown')}\nRemediation steps: {', '.join(result.get('remediation_steps', []))}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return result
        elif source == "kubernetes":
            pod_name, namespace, container_name = self._extract_pod_info(error_message)
            if not pod_name or not namespace or not container_name:
                result = {
                    "reference": ref,
                    "root_cause": "Failed to extract pod information",
                    "remediation_steps": [],
                    "manifest_file": None,
                    "source": "kubernetes"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {result.get('root_cause', 'Unknown')}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return result

            manifest_file, commands = self._modify_pod_manifest(pod_name, namespace, container_name)
            if not commands:
                result = {
                    "reference": ref,
                    "root_cause": "Failed to modify pod manifest",
                    "remediation_steps": [],
                    "manifest_file": None,
                    "source": "kubernetes"
                }
                timestamp = datetime.now().strftime("%H:%M:%S")
                details = f"Root cause identified: {result.get('root_cause', 'Unknown')}"
                asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
                return result

            result = {
                "reference": ref,
                "root_cause": f"OOMKilled error in pod {pod_name} in namespace {namespace}",
                "remediation_steps": commands,
                "manifest_file": manifest_file,
                "source": "kubernetes"
            }
            timestamp = datetime.now().strftime("%H:%M:%S")
            details = f"Root cause identified: {result.get('root_cause', 'Unknown')}\nRemediation steps: {', '.join(result.get('remediation_steps', []))}"
            if result.get("manifest_file"):
                details += f"\nManifest file: {result.get('manifest_file')}"
            asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
            return result
        else:
            result = {
                "reference": ref,
                "root_cause": f"Cannot analyze {source} error: Invalid source or no Snowflake connection",
                "remediation_steps": [],
                "source": source
            }
            timestamp = datetime.now().strftime("%H:%M:%S")
            details = f"Root cause identified: {result.get('root_cause', 'Unknown')}"
            asyncio.create_task(self._async_broadcast("ErrorAnalyzer", "analysis complete", timestamp, details, ref))
            return result

    def run(self):
        self.logger.info(f"ErrorAnalyzerAgent started for Windows ({self.hostname}), Snowflake, and Kubernetes")
        for log_file in [self.ERROR_LOG_WINDOWS, self.ERROR_LOG_SNOWFLAKE, self.ERROR_LOG_KUBERNETES]:
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
                        result = self.analyze_error(err.strip(), source="windows")
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
                        result = self.analyze_error(err.strip(), source="snowflake")
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
                        result = self.analyze_error(err.strip(), source="kubernetes")
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

            time.sleep(10)

if __name__ == "__main__":
    llm_config = {"model": "gpt-4o", "api_key": os.getenv("OPEN_API_KEY")}
    analyzer = ErrorAnalyzerAgent(name="ErrorAnalyzerAgent", llm_config=llm_config)
    analyzer.run()