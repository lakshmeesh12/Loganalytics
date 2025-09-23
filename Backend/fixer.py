import os
import json
import time
import logging
import snowflake.connector
import subprocess
from autogen import AssistantAgent
from dotenv import load_dotenv
import re
from datetime import datetime
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import socket
import configparser
import asyncio
import requests
from abc import ABC, abstractmethod
import openai

load_dotenv()

class BaseRemediator(ABC):
    def __init__(self, agent):
        self.agent = agent

    @abstractmethod
    async def apply_remediation(self, remediation_steps, error_message, root_cause, manifest_file, reference):
        pass

class WindowsRemediator(BaseRemediator):
    async def apply_remediation(self, remediation_steps, error_message, root_cause, manifest_file, reference):
        max_retries = 3
        current_steps = remediation_steps.copy()
        attempt = 1
        success = False

        while attempt <= max_retries:
            step_success = True
            for step in current_steps:
                if not isinstance(step, str) or not (
                    step.startswith("cmd /c \"sc config ") or
                    step.startswith("sc config ") or
                    step.startswith("Start-Service -Name ") or
                    step.startswith("Get-Service ")
                ):
                    self.agent.logger.warning(f"Skipped invalid Windows command: {step}")
                    continue
                self.agent.logger.info(f"Executing remediation step: {step} (Attempt {attempt})")
                result = self.agent._execute_powershell_command(step, remote=(self.agent.target_server != "localhost"))
                if not result["success"]:
                    self.agent.logger.error(f"Attempt {attempt}: Failed to apply Windows remediation step: {step}, Output: {result['output']}")
                    step_success = False

                    if attempt < max_retries:
                        service_name = None
                        if step.startswith("cmd /c \"sc config") or step.startswith("sc config"):
                            match = re.search(r"sc config\s+(\w+)", step)
                            if match:
                                service_name = match.group(1)
                        elif step.startswith("Start-Service"):
                            match = re.search(r"Start-Service -Name\s+['\"]?(\w+)", step)
                            if match:
                                service_name = match.group(1)

                        if service_name:
                            ps_command = f"Get-Service -Name '{service_name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"
                            norm_result = self.agent._execute_powershell_command(ps_command, remote=(self.agent.target_server != "localhost"))
                            if norm_result["success"] and norm_result["output"].strip():
                                service_name = norm_result["output"].strip()
                            else:
                                ps_command = f"Get-Service -DisplayName '{service_name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"
                                norm_result = self.agent._execute_powershell_command(ps_command, remote=(self.agent.target_server != "localhost"))
                                if norm_result["success"] and norm_result["output"].strip():
                                    service_name = norm_result["output"].strip()

                        client = openai.OpenAI(api_key=os.getenv("OPEN_API_KEY"))
                        prompt = (
                            "You are a Windows error remediation assistant. The following remediation step failed for a Windows Event ID 7003 error. "
                            "Generate new remediation steps to fix the service startup issue caused by an invalid dependency.\n\n"
                            f"Original Error Log: {error_message}\n"
                            f"Root Cause: {root_cause}\n"
                            f"Failed Command: {step}\n"
                            f"Error Output: {result['output']}\n"
                            f"Service Name (if known): {service_name or 'unknown'}\n\n"
                            "Return a JSON object with:\n"
                            "- 'remediation_steps': a list of exactly two directly executable commands:\n"
                            "  1. A command in the format 'cmd /c \"sc config <service_name> depend= <valid_dependencies>\"' to set correct dependencies (default to 'RPCSS' if unknown).\n"
                            "  2. A command in the format 'Start-Service -Name <service_name>' to restart the service.\n"
                            "Use the provided service name if valid, otherwise infer from the error log or root cause. "
                            "Ensure commands are formatted exactly as shown, without extra quotes or formatting that would prevent direct execution in PowerShell or cmd. "
                            "Return valid JSON without any explanation."
                        )
                        try:
                            response = client.chat.completions.create(
                                model="gpt-4o",
                                messages=[
                                    {"role": "system", "content": "You are a helpful assistant."},
                                    {"role": "user", "content": prompt}
                                ],
                                max_tokens=300
                            )
                            reply_content = response.choices[0].message.content.strip()
                            self.agent.logger.info(f"LLM reply for fallback remediation (Attempt {attempt}): {reply_content[:200]}...")
                            match = re.search(r"```json\s*(\{.*?\})\s*```", reply_content, re.DOTALL)
                            if match:
                                json_str = match.group(1)
                            else:
                                json_str = reply_content
                            new_result = json.loads(json_str)
                            current_steps = new_result.get("remediation_steps", current_steps)
                            if (
                                len(current_steps) != 2 or
                                not current_steps[0].startswith(f"cmd /c \"sc config {service_name or 'Spooler'} depend=") or
                                not current_steps[1].startswith(f"Start-Service -Name {service_name or 'Spooler'}")
                            ):
                                self.agent.logger.warning(f"Invalid fallback remediation steps: {current_steps}, using default steps")
                                current_steps = [
                                    f"cmd /c \"sc config {service_name or 'Spooler'} depend= RPCSS\"",
                                    f"Start-Service -Name {service_name or 'Spooler'}"
                                ]
                            self.agent.logger.info(f"Generated new remediation steps: {current_steps}")
                            break
                        except json.JSONDecodeError as json_err:
                            self.agent.logger.error(f"JSON parsing error in LLM fallback: {json_err}, Response: {reply_content[:200]}...")
                            current_steps = [
                                f"cmd /c \"sc config {service_name or 'Spooler'} depend= RPCSS\"",
                                f"Start-Service -Name {service_name or 'Spooler'}"
                            ]
                            break
                        except Exception as e:
                            self.agent.logger.error(f"OpenAI API error in LLM fallback: {e}")
                            current_steps = [
                                f"cmd /c \"sc config {service_name or 'Spooler'} depend= RPCSS\"",
                                f"Start-Service -Name {service_name or 'Spooler'}"
                            ]
                            break
                    else:
                        self.agent.logger.info(f"Applied Windows remediation step: {step}, Output: {result['output']}")
            if step_success:
                success = True
                if any(step.startswith("Start-Service") for step in current_steps):
                    service_name_match = re.search(r"Start-Service -Name\s+['\"]?(\w+)['\"]?", current_steps[-1])
                    if service_name_match:
                        service_name = service_name_match.group(1)
                        status_cmd = f"Get-Service -Name '{service_name}' | Select-Object -Property Name,Status,DependentServices,ServicesDependedOn | Format-List | Out-String"
                        status_result = self.agent._execute_powershell_command(status_cmd, remote=(self.agent.target_server != "localhost"))
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fixer.log", "a", encoding="utf-8") as f:
                            f.write(f"[{datetime.now()}] Post-remediation status for {service_name}:\n{status_result['output']}\n{'-' * 60}\n")
                break
            attempt += 1
        if success and reference:
            timestamp = datetime.now().strftime("%H:%M:%S")
            commands_str = "\n".join(remediation_steps)
            details = (
                f"remediation applied\n"
                f"LATEST\n\n"
                f"Executing remediation command\n\n"
                f"Commands:\n"
                f"{commands_str}"
            )
            await self.agent._async_broadcast("FixerAgent", "remediation applied", timestamp, details, reference)
        return success

class SnowflakeRemediator(BaseRemediator):
    async def apply_remediation(self, remediation_steps, error_message, root_cause, manifest_file, reference):
        cursor = self.agent.snowflake_conn.cursor()
        step_success = True
        for step in remediation_steps:
            try:
                if isinstance(step, dict) and "command" in step:
                    command = step["command"]
                elif isinstance(step, str):
                    command = step
                else:
                    self.agent.logger.warning(f"Skipping unrecognized step format: {step}")
                    continue
                if re.match(r"^\s*GRANT\s+.*\s+ON\s+.*\s+TO\s+.*;$", command, flags=re.IGNORECASE):
                    cursor.execute(command)
                    self.agent.logger.info(f"Executed Snowflake command: {command}")
                else:
                    self.agent.logger.warning(f"Skipped non-GRANT command or unsafe statement: {command}")
            except Exception as e:
                self.agent.logger.error(f"Failed to execute Snowflake command: {command}, Error: {e}")
                step_success = False
                with open("C:/Users/Quadrant/Loganalytics/Backend/snowflake_errors.log", "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.now()}] Remediation error for {command}:\n{str(e)}\n{'-' * 60}\n")
        cursor.close()
        if step_success:
            success = True
            if reference:
                timestamp = datetime.now().strftime("%H:%M:%S")
                commands_str = "\n".join(remediation_steps)
                details = (
                    f"remediation applied\n"
                    f"LATEST\n\n"
                    f"Executing remediation command\n\n"
                    f"Commands:\n"
                    f"{commands_str}"
                )
                await self.agent._async_broadcast("FixerAgent", "remediation applied", timestamp, details, reference)
            return success
        return False

class KubernetesRemediator(BaseRemediator):
    async def apply_remediation(self, remediation_steps, error_message, root_cause, manifest_file, reference):
        step_success = True
        for step in remediation_steps:
            try:
                if isinstance(step, str) and (step.startswith("kubectl apply -f") or step.startswith("kubectl delete pod")):
                    result = subprocess.run(step, shell=True, capture_output=True, text=True)
                    if result.returncode != 0:
                        self.agent.logger.error(f"Failed to execute Kubernetes command: {step}, Error: {result.stderr}")
                        step_success = False
                        with open("C:/Users/Quadrant/Loganalytics/Backend/kubernetes_errors.log", "a", encoding="utf-8") as f:
                            f.write(f"[{datetime.now()}] Remediation error for {step}:\n{result.stderr}\n{'-' * 60}\n")
                    else:
                        self.agent.logger.info(f"Executed Kubernetes command: {step}")
                else:
                    self.agent.logger.warning(f"Skipped invalid Kubernetes command: {step}")
            except Exception as e:
                self.agent.logger.error(f"Error executing Kubernetes command: {e}")
                step_success = False
                with open("C:/Users/Quadrant/Loganalytics/Backend/kubernetes_errors.log", "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.now()}] Remediation error for {step}:\n{str(e)}\n{'-' * 60}\n")
        if step_success:
            success = True
            if reference:
                timestamp = datetime.now().strftime("%H:%M:%S")
                commands_str = "\n".join(remediation_steps)
                details = (
                    f"remediation applied\n"
                    f"LATEST\n\n"
                    f"Executing remediation command\n\n"
                    f"Commands:\n"
                    f"{commands_str}"
                )
                await self.agent._async_broadcast("FixerAgent", "remediation applied", timestamp, details, reference)
            return success
        return False

class DatabricksRemediator(BaseRemediator):
    async def apply_remediation(self, remediation_steps, error_message, root_cause, manifest_file, reference):
        # Extract table name from error_message string instead of assuming JSON
        table_match = re.search(r'QueryText: INSERT INTO\s+([a-zA-Z0-9_\.]+)\s', error_message, re.IGNORECASE)
        table_name = table_match.group(1) if table_match else None
        if not table_name:
            self.agent.logger.error("Table name not found in error message")
            return False

        step_success = False
        for step in remediation_steps:
            try:
                body = json.loads(step)
                principal = body["changes"][0]["principal"]
                permissions = body["changes"][0]["add"]
                result = self.agent._execute_databricks_api_call(table_name, principal, permissions)
                if result["success"]:
                    step_success = True
                else:
                    self.agent.logger.error(f"Failed to apply Databricks remediation: {result['output']}")
                    break
            except json.JSONDecodeError as e:
                self.agent.logger.warning(f"Failed to parse remediation step as JSON: {e}, Step: {step}")
            except KeyError as e:
                self.agent.logger.warning(f"Invalid remediation step structure: missing key {e}, Step: {step}")
            except Exception as e:
                self.agent.logger.error(f"Error executing Databricks remediation step: {e}")
                with open("C:/Users/Quadrant/Loganalytics/Backend/databricks_errors.log", "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.now()}] Remediation error for {step}: {str(e)}\n{'-' * 60}\n")

        if step_success:
            success = True
            if reference:
                timestamp = datetime.now().strftime("%H:%M:%S")
                commands_str = "\n".join(remediation_steps)
                details = (
                    f"remediation applied\n"
                    f"LATEST\n\n"
                    f"Executing remediation command\n\n"
                    f"Commands:\n"
                    f"{commands_str}"
                )
                await self.agent._async_broadcast("FixerAgent", "remediation applied", timestamp, details, reference)
            return success
        return False

class FixerAgent(AssistantAgent):
    def __init__(self, name, llm_config=None, analyzer_agent=None, ws_manager=None):
        super().__init__(name=name, llm_config=llm_config)
        self.logger = logging.getLogger("FixerAgent")
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler("C:/Users/Quadrant/Loganalytics/Backend/fixer.log"),
                logging.StreamHandler()
            ]
        )
        self.ws_manager = ws_manager 
        # Windows configuration
        self.config = configparser.ConfigParser()
        config_path = os.getenv("CONFIG_PATH", "C:/Users/Quadrant/Loganalytics/Backend/config.ini")
        if os.path.exists(config_path):
            self.config.read(config_path)
            self.target_server = self.config.get('Windows', 'TargetServer', fallback='localhost')
        else:
            self.target_server = os.getenv("WINDOWS_TARGET_SERVER", "localhost")
        self.hostname = socket.gethostname() if self.target_server == "localhost" else self.target_server
        # Snowflake configuration
        self.snowflake_conn = None
        try:
            self.snowflake_conn = self._connect_to_snowflake()
        except Exception as e:
            self.logger.error(f"Failed to initialize Snowflake connection: {e}")
            with open("C:/Users/Quadrant/Loganalytics/Backend/snowflake_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Initialization error: {e}\n{'-' * 60}\n")
        # Databricks configuration
        self.databricks_host = os.getenv("DATABRICKS_HOST", "https://dbc-b5703667-6412.cloud.databricks.com")
        self.databricks_token = os.getenv("DATABRICKS_TOKEN")
        self.analyzer_agent = analyzer_agent
        self.remediators = {
            "windows": WindowsRemediator(self),
            "kubernetes": KubernetesRemediator(self),
            "databricks": DatabricksRemediator(self)
        }
        if self.snowflake_conn:
            self.remediators["snowflake"] = SnowflakeRemediator(self)

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
        self.logger.info("Successfully connected to Snowflake")
        return conn

    def _execute_powershell_command(self, command: str, remote: bool = False) -> dict:
        """Execute a PowerShell or cmd command locally or remotely, returning status and output."""
        try:
            # Validate and prepare command
            if command.startswith("cmd /c \"sc config"):
                match = re.search(r'cmd /c "sc config\s+(\w+)\s+depend=\s+([\w\s]+)"', command)
                if not match:
                    self.logger.error(f"Invalid sc config command format: {command}")
                    return {"success": False, "output": "Invalid command format"}
                service_name = match.group(1)
                dependencies = match.group(2)
                check_cmd = f"Get-Service -Name '{service_name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"
                check_result = subprocess.run(
                    ["powershell", "-Command", check_cmd],
                    capture_output=True, text=True, shell=False
                )
                if check_result.returncode != 0 or not check_result.stdout.strip():
                    self.logger.error(f"Service {service_name} does not exist")
                    return {"success": False, "output": f"Service {service_name} does not exist"}
                cmd_string = f"sc config {service_name} depend= {dependencies}"
                admin_cmd = f"Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', '{cmd_string}' -Verb RunAs -Wait -PassThru"
                cmd_args = ["powershell", "-Command", admin_cmd]
            elif command.startswith("sc config"):
                match = re.search(r"sc config\s+(\w+)\s+depend=\s+([\w\s]+)", command)
                if not match:
                    self.logger.error(f"Invalid sc config command format: {command}")
                    return {"success": False, "output": "Invalid command format"}
                service_name = match.group(1)
                dependencies = match.group(2)
                check_cmd = f"Get-Service -Name '{service_name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"
                check_result = subprocess.run(
                    ["powershell", "-Command", check_cmd],
                    capture_output=True, text=True, shell=False
                )
                if check_result.returncode != 0 or not check_result.stdout.strip():
                    self.logger.error(f"Service {service_name} does not exist")
                    return {"success": False, "output": f"Service {service_name} does not exist"}
                cmd_string = f"sc config {service_name} depend= {dependencies}"
                admin_cmd = f"Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', '{cmd_string}' -Verb RunAs -Wait -PassThru"
                cmd_args = ["powershell", "-Command", admin_cmd]
            elif command.startswith("Start-Service"):
                match = re.search(r"Start-Service -Name\s+['\"]?(\w+)['\"]?", command)
                if not match:
                    self.logger.error(f"Invalid Start-Service command format: {command}")
                    return {"success": False, "output": "Invalid command format"}
                service_name = match.group(1)
                check_cmd = f"Get-Service -Name '{service_name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"
                check_result = subprocess.run(
                    ["powershell", "-Command", check_cmd],
                    capture_output=True, text=True, shell=False
                )
                if check_result.returncode != 0 or not check_result.stdout.strip():
                    self.logger.error(f"Service {service_name} does not exist")
                    return {"success": False, "output": f"Service {service_name} does not exist"}
                admin_cmd = f"Start-Process -FilePath 'powershell.exe' -ArgumentList '-Command', 'Start-Service -Name \"{service_name}\" -ErrorAction Stop' -Verb RunAs -Wait -PassThru"
                cmd_args = ["powershell", "-Command", admin_cmd]
            elif command.startswith("Get-Service"):
                cmd_args = ["powershell", "-Command", command]
            else:
                self.logger.error(f"Unsupported command: {command}")
                return {"success": False, "output": "Unsupported command"}
            if remote and self.target_server != "localhost":
                remote_cmd = f"Invoke-Command -ComputerName {self.target_server} -ScriptBlock {{{cmd_args[-1]}}}"
                result = subprocess.run(
                    ["powershell", "-Command", remote_cmd],
                    capture_output=True, text=True, shell=False
                )
            else:
                result = subprocess.run(
                    cmd_args,
                    capture_output=True, text=True, shell=False
                )
            if result.returncode == 0:
                self.logger.info(f"Successfully executed command: {command}")
                if command.startswith("Start-Service"):
                    service_name_match = re.search(r"Start-Service -Name\s+['\"]?(\w+)['\"]?", command)
                    if service_name_match:
                        service_name = service_name_match.group(1)
                        status_cmd = f"Get-Service -Name '{service_name}' | Select-Object -ExpandProperty Status"
                        status_result = subprocess.run(
                            ["powershell", "-Command", status_cmd],
                            capture_output=True, text=True, shell=False
                        )
                        if status_result.returncode == 0 and "Running" in status_result.stdout:
                            self.logger.info(f"Service {service_name} is now Running")
                            return {"success": True, "output": result.stdout.strip()}
                        else:
                            self.logger.error(f"Service {service_name} failed to start. Status: {status_result.stdout}")
                            return {"success": False, "output": f"Service failed to start: {status_result.stdout}"}
                return {"success": True, "output": result.stdout.strip()}
            else:
                error_msg = result.stderr.strip() or result.stdout.strip() or "Unknown error (possibly insufficient privileges)"
                self.logger.error(f"Failed to execute command: {command}, Error: {error_msg}")
                with open("C:/Users/Quadrant/Loganalytics/Backend/fixer.log", "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.now()}] Remediation error for {command}:\n{error_msg}\n{'-' * 60}\n")
                return {"success": False, "output": error_msg}
        except Exception as e:
            error_msg = str(e) or "Unknown execution error"
            self.logger.error(f"Error executing command: {command}, Error: {error_msg}")
            with open("C:/Users/Quadrant/Loganalytics/Backend/fixer.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Remediation error for {command}:\n{error_msg}\n{'-' * 60}\n")
            return {"success": False, "output": error_msg}

    def _execute_databricks_api_call(self, table_name: str, principal: str, permissions: list) -> dict:
        """Execute a Databricks Unity Catalog API call to update table permissions."""
        try:
            if not self.databricks_token:
                self.logger.error("Databricks token not provided in environment variables")
                return {"success": False, "output": "Databricks token not provided"}
            
            url = f"{self.databricks_host}/api/2.1/unity-catalog/permissions/table/{table_name}"
            headers = {"Authorization": f"Bearer {self.databricks_token}"}
            body = {
                "changes": [
                    {
                        "principal": principal,
                        "add": permissions
                    }
                ]
            }
            self.logger.info(f"Applying permission {permissions} for principal {principal} on table {table_name}")
            self.logger.info(f"Executing Databricks API call: PATCH {url}, Body: {json.dumps(body)}")
            response = requests.patch(url, headers=headers, json=body)
            
            if response.status_code == 200:
                self.logger.info(f"Permission granted successfully for {principal} on table {table_name}: {response.text}")
                return {"success": True, "output": response.text}
            else:
                error_msg = f"Databricks API error: Status {response.status_code}, Response: {response.text}"
                self.logger.error(error_msg)
                with open("C:/Users/Quadrant/Loganalytics/Backend/databricks_errors.log", "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.now()}] {error_msg}\n{'-' * 60}\n")
                return {"success": False, "output": error_msg}
        except Exception as e:
            error_msg = f"Error executing Databricks API call: {str(e)}"
            self.logger.error(error_msg)
            with open("C:/Users/Quadrant/Loganalytics/Backend/databricks_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] {error_msg}\n{'-' * 60}\n")
            return {"success": False, "output": error_msg}

    async def receive_error(self, error_message, root_cause, remediation_steps, source, manifest_file=None, reference=None):
        self.logger.info(f"Received {source} error from analyzer. Root cause: {root_cause}")
        if source not in self.remediators:
            self.logger.warning(f"Skipping {source} remediation: Invalid source or no Snowflake/Databricks connection")
            return
        remediator = self.remediators[source]
        await remediator.apply_remediation(remediation_steps, error_message, root_cause, manifest_file, reference)

    async def run_async(self):
        self.logger.info(f"FixerAgent is now running for Windows ({self.hostname}), Snowflake, Kubernetes, and Databricks...")
        try:
            while True:
                if os.path.exists("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json") and os.path.getsize("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json") > 0:
                    try:
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        remediation_steps = data.get("remediation_steps", [])
                        source = data.get("source", "unknown")
                        manifest_file = data.get("manifest_file", None)
                        reference = data.get("reference", None)
                        await self.receive_error(
                            data.get("error"),
                            data.get("root_cause"),
                            remediation_steps,
                            source,
                            manifest_file,
                            reference
                        )
                        open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w').close()
                    except json.JSONDecodeError as e:
                        self.logger.error(f"Failed to parse fix_queue.json: {e}")
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fixer.log", "a", encoding="utf-8") as f:
                            f.write(f"[{datetime.now()}] Error parsing fix_queue.json: {e}\n{'-' * 60}\n")
                        open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w').close()
                    except Exception as e:
                        self.logger.error(f"FixerAgent error: {e}")
                        with open("C:/Users/Quadrant/Loganalytics/Backend/fixer.log", "a", encoding="utf-8") as f:
                            f.write(f"[{datetime.now()}] FixerAgent error: {e}\n{'-' * 60}\n")
                await asyncio.sleep(10)
        except asyncio.CancelledError:
            self.logger.info("FixerAgent stopped by user")
        except Exception as e:
            self.logger.error(f"Error in FixerAgent loop: {e}")

    def run(self):
        """Synchronous wrapper for running the async fixer loop."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self.run_async())
        finally:
            loop.close()

if __name__ == "__main__":
    fixer = FixerAgent(name="FixerAgent")
    fixer.run()