import snowflake.connector
import boto3
import win32evtlog
from datetime import datetime, timedelta, timezone
import logging
import os
from dotenv import load_dotenv
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import socket
import configparser
import json
import asyncio
import requests
from utils import setup_logging

load_dotenv()

# Custom filter to suppress specific broadcast-related log messages
class BroadcastFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage().lower()
        return not ("preparing for broadcast" in msg or "broadcasted" in msg)

class LogForwarderAgent:
    def __init__(self, name="LogForwarderAgent", llm_config=None, ws_manager=None):
        self.logger = logging.getLogger("FORWARDER")
        for handler in self.logger.handlers:
            handler.addFilter(BroadcastFilter())
        self.ws_manager = ws_manager
        self.logger.info("LogForwarderAgent initialized", extra={"source": "System"})
        
        # Windows log configuration
        self.config = configparser.ConfigParser()
        config_path = os.getenv("CONFIG_PATH", "C:/Users/Quadrant/Loganalytics/Backend/config.ini")
        if os.path.exists(config_path):
            self.config.read(config_path)
            self.target_server = self.config.get('Windows', 'TargetServer', fallback='localhost')
        else:
            self.target_server = os.getenv("WINDOWS_TARGET_SERVER", "localhost")
        self.hostname = socket.gethostname() if self.target_server == "localhost" else self.target_server
        
        # CloudWatch client for ap-south-1 region
        self.cloudwatch = boto3.client('logs', region_name='ap-south-1')
        self.sequence_token = {}
        self.last_event_record = self.get_latest_event_record()

        # Snowflake configuration
        self.USER = os.getenv("SNOWFLAKE_USER")
        self.ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
        self.ROLE = 'ACCOUNTADMIN'
        self.WAREHOUSE = 'COMPUTE_WH'
        self.DATABASE = 'SNOWFLAKE'
        self.SCHEMA = 'ACCOUNT_USAGE'
        self.PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH", "C:/Users/Quadrant/Loganalytics/Backend/snowflake_key.pem")
        self.PRIVATE_KEY_PASSPHRASE = os.getenv("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE", None)
        self.LOG_CONFIG = {
            "QUERY_HISTORY": "START_TIME",
            "LOGIN_HISTORY": "EVENT_TIMESTAMP",
            "TASK_HISTORY": "SCHEDULED_TIME",
            "GRANTS_TO_USERS": "CREATED_ON",
            "WAREHOUSE_LOAD_HISTORY": "START_TIME"
        }
        self.last_timestamps = {
            view: datetime.now(timezone.utc) - timedelta(minutes=5)
            for view in self.LOG_CONFIG
        }
        self.conn = None
        try:
            self.conn = self.connect_to_snowflake()
        except Exception as e:
            self.logger.error(f"Failed to initialize Snowflake connection: {e}", extra={"source": "Snowflake"})
            with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Initialization error: {e}\n{'-' * 60}\n")

        # Databricks configuration
        self.DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "https://dbc-b5703667-6412.cloud.databricks.com")
        self.DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "dapi3b30203e5f2e5329533ee6bd3c89515a")
        self.seen_query_ids = self.get_existing_databricks_query_ids()
        self.databricks_poll_interval = 10  # seconds
        self.max_wait_time = 60  # Maximum seconds to wait for query to reach terminal state

    def get_latest_event_record(self):
        try:
            hand = win32evtlog.OpenEventLog(self.target_server, 'System')
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
            events = win32evtlog.ReadEventLog(hand, flags, 0)
            if events:
                latest_event = events[0]
                return latest_event.RecordNumber
            return 0
        except Exception as e:
            self.logger.error(f"Error getting latest event record: {e}", extra={"source": "Windows"})
            return 0
        finally:
            if 'hand' in locals():
                win32evtlog.CloseEventLog(hand)

    def ensure_log_group_exists(self, log_group):
        self.logger.debug(f"Checking if log group {log_group} exists", extra={"source": "CloudWatch"})
        try:
            groups = self.cloudwatch.describe_log_groups(logGroupNamePrefix=log_group)
            if not any(group['logGroupName'] == log_group for group in groups.get('logGroups', [])):
                self.cloudwatch.create_log_group(logGroupName=log_group)
                self.logger.info(f"Created log group: {log_group}", extra={"source": "CloudWatch"})
        except Exception as e:
            self.logger.error(f"Failed to check or create log group {log_group}: {e}", extra={"source": "CloudWatch"})

    def create_log_stream(self, log_group, log_stream):
        try:
            self.cloudwatch.create_log_stream(logGroupName=log_group, logStreamName=log_stream)
            self.logger.debug(f"Created log stream: {log_group}/{log_stream}", extra={"source": "CloudWatch"})
        except self.cloudwatch.exceptions.ResourceAlreadyExistsException:
            self.logger.debug(f"Log stream already exists: {log_group}/{log_stream}", extra={"source": "CloudWatch"})
        except Exception as e:
            self.logger.error(f"Failed to create log stream {log_group}/{log_stream}: {e}", extra={"source": "CloudWatch"})

    def send_log_event(self, log_group, log_stream, message):
        timestamp_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        kwargs = {
            'logGroupName': log_group,
            'logStreamName': log_stream,
            'logEvents': [{
                'timestamp': timestamp_ms,
                'message': json.dumps(message)
            }]
        }
        try:
            if log_stream in self.sequence_token:
                kwargs['sequenceToken'] = self.sequence_token[log_stream]
            response = self.cloudwatch.put_log_events(**kwargs)
            self.sequence_token[log_stream] = response['nextSequenceToken']
            self.logger.info(f"Sent log to {log_group}/{log_stream}", extra={"source": "CloudWatch"})
        except self.cloudwatch.exceptions.InvalidSequenceTokenException as e:
            expected = str(e).split("expected sequenceToken is: ")[-1]
            self.sequence_token[log_stream] = expected
            kwargs['sequenceToken'] = expected
            response = self.cloudwatch.put_log_events(**kwargs)
            self.sequence_token[log_stream] = response['nextSequenceToken']
            self.logger.info(f"Retried log to {log_group}/{log_stream} after token fix", extra={"source": "CloudWatch"})
        except Exception as e:
            self.logger.error(f"Failed to send log to {log_group}/{log_stream}: {e}", extra={"source": "CloudWatch"})
            with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Failed to send log to {log_group}/{log_stream}: {e}\n{'-' * 60}\n")

    def fetch_and_forward_windows_logs(self):
        log_group = f"/windows/{self.hostname}"
        log_stream = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")
        self.ensure_log_group_exists(log_group)
        self.create_log_stream(log_group, log_stream)
        log_type = 'System'
        flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
        try:
            hand = win32evtlog.OpenEventLog(self.target_server, log_type)
            events = win32evtlog.ReadEventLog(hand, flags, self.last_event_record)
            if not events:
                self.logger.info(f"No new Windows System log events from {self.target_server}", extra={"source": "Windows"})
                return
            self.logger.info(f"Found {len(events)} new Windows System log events from {self.target_server}", extra={"source": "Windows"})
            latest_record = self.last_event_record
            for event in events:
                if event.RecordNumber > self.last_event_record:
                    event_data = {
                        'EventID': event.EventID & 0xFFFF,
                        'Source': event.SourceName,
                        'TimeGenerated': event.TimeGenerated.strftime('%Y-%m-%d %H:%M:%S'),
                        'Message': event.StringInserts or [],
                        'EventType': event.EventType,
                        'ComputerName': event.ComputerName,
                        'RecordNumber': event.RecordNumber
                    }
                    self.send_log_event(log_group, log_stream, event_data)
                    latest_record = max(latest_record, event.RecordNumber)
            self.last_event_record = latest_record
            self.logger.info(f"Updated last event record to {self.last_event_record} for {self.target_server}", extra={"source": "Windows"})
        except Exception as e:
            self.logger.error(f"Error fetching Windows System logs from {self.target_server}: {e}", extra={"source": "Windows"})
            with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Error fetching Windows System logs from {self.target_server}: {e}\n{'-' * 60}\n")
        finally:
            if 'hand' in locals():
                win32evtlog.CloseEventLog(hand)

    def fetch_and_forward_snowflake_logs(self, view_name, timestamp_col):
        if not self.conn:
            self.logger.warning(f"Skipping {view_name} fetch: No Snowflake connection", extra={"source": "Snowflake"})
            return
        log_group = f"/snowflake/{view_name}"
        log_stream = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")
        self.ensure_log_group_exists(log_group)
        self.create_log_stream(log_group, log_stream)
        cursor = self.conn.cursor()
        try:
            query = f"""
            SELECT *
            FROM {self.DATABASE}.{self.SCHEMA}.{view_name}
            WHERE {timestamp_col} > %s
            AND {timestamp_col} IS NOT NULL
            ORDER BY {timestamp_col} ASC
            LIMIT 100;
            """
            cursor.execute(query, (self.last_timestamps[view_name],))
            rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]
            if not rows:
                self.logger.info(f"No new logs for {view_name}", extra={"source": "Snowflake"})
            else:
                self.logger.info(f"Found {len(rows)} new logs for {view_name}", extra={"source": "Snowflake"})
                for row in rows:
                    message = {
                        view_name: {col: str(val) for col, val in zip(columns, row)}
                    }
                    self.send_log_event(log_group, log_stream, message)
                self.last_timestamps[view_name] = rows[-1][columns.index(timestamp_col)]
        except Exception as e:
            self.logger.error(f"Error fetching {view_name}: {e}", extra={"source": "Snowflake"})
            with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Error fetching {view_name}: {e}\n{'-' * 60}\n")
        finally:
            cursor.close()

    def connect_to_snowflake(self):
        self.logger.info("Connecting to Snowflake using key pair authentication...", extra={"source": "Snowflake"})
        with open(self.PRIVATE_KEY_PATH, "rb") as key_file:
            p_key = serialization.load_pem_private_key(
                key_file.read(),
                password=self.PRIVATE_KEY_PASSPHRASE.encode() if self.PRIVATE_KEY_PASSPHRASE else None,
                backend=default_backend()
            )
        private_key = p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        conn = snowflake.connector.connect(
            user=self.USER,
            account=self.ACCOUNT,
            private_key=private_key,
            role=self.ROLE,
            warehouse=self.WAREHOUSE,
            database=self.DATABASE,
            schema=self.SCHEMA
        )
        self.logger.info("Connected to Snowflake", extra={"source": "Snowflake"})
        return conn

    def get_existing_databricks_query_ids(self):
        """Fetch existing Databricks query IDs to avoid processing them again."""
        try:
            url = f"{self.DATABRICKS_HOST}/api/2.0/sql/history/queries"
            headers = {"Authorization": f"Bearer {self.DATABRICKS_TOKEN}"}
            response = requests.get(url, headers=headers, params={"max_results": 100})
            ids = set()
            if response.status_code == 200:
                data = response.json()
                for query in data.get("res", []):
                    ids.add(query.get("query_id"))
                self.logger.info(f"Fetched {len(ids)} existing Databricks query IDs", extra={"source": "Databricks"})
            else:
                self.logger.error(f"Failed to fetch existing Databricks query IDs: {response.text}", extra={"source": "Databricks"})
            return ids
        except Exception as e:
            self.logger.error(f"Error fetching existing Databricks query IDs: {e}", extra={"source": "Databricks"})
            return set()

    async def get_databricks_query_details(self, query_id):
        """Fetch details for a specific Databricks query, waiting for terminal state."""
        headers = {"Authorization": f"Bearer {self.DATABRICKS_TOKEN}"}
        error_url = f"{self.DATABRICKS_HOST}/api/2.0/sql/history/queries/{query_id}"
        start_time = datetime.now(timezone.utc)
        
        while (datetime.now(timezone.utc) - start_time).total_seconds() < self.max_wait_time:
            try:
                response = requests.get(error_url, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    status = data.get("status")
                    if status in ["FINISHED", "FAILED", "CANCELED"]:
                        query_data = {
                            "query_id": query_id,
                            "status": status,
                            "user_name": data.get("user_name"),
                            "query_text": data.get("query_text"),
                            "start_time_ms": data.get("start_time_ms"),
                            "end_time_ms": data.get("end_time_ms")
                        }
                        if status == "FAILED":
                            query_data["error_message"] = data.get("error_message", "No error message available")
                        return query_data
                    self.logger.debug(f"Query {query_id} still in {status} state, waiting...", extra={"source": "Databricks"})
                    await asyncio.sleep(2)  # Wait before retrying
                else:
                    self.logger.error(f"Failed to fetch Databricks query details for {query_id}: {response.text}", extra={"source": "Databricks"})
                    return None
            except Exception as e:
                self.logger.error(f"Error fetching Databricks query details for {query_id}: {e}", extra={"source": "Databricks"})
                return None
        self.logger.warning(f"Query {query_id} did not reach terminal state within {self.max_wait_time} seconds", extra={"source": "Databricks"})
        return None

    async def fetch_and_forward_databricks_logs(self):
        """Fetch new Databricks query logs and forward to CloudWatch after terminal state."""
        log_group = "/aws/databricks/audit-logs"
        log_stream = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")
        self.ensure_log_group_exists(log_group)
        self.create_log_stream(log_group, log_stream)
        
        try:
            url = f"{self.DATABRICKS_HOST}/api/2.0/sql/history/queries"
            headers = {"Authorization": f"Bearer {self.DATABRICKS_TOKEN}"}
            response = requests.get(url, headers=headers, params={"max_results": 20})
            if response.status_code == 200:
                data = response.json()
                new_queries = []
                for query in data.get("res", []):
                    query_id = query.get("query_id")
                    if query_id not in self.seen_query_ids:
                        new_queries.append(query_id)
                        self.seen_query_ids.add(query_id)
                
                if new_queries:
                    self.logger.info(f"Found {len(new_queries)} new Databricks queries", extra={"source": "Databricks"})
                    for query_id in new_queries:
                        query_data = await self.get_databricks_query_details(query_id)
                        if query_data:
                            self.send_log_event(log_group, log_stream, query_data)
                            self.logger.info(f"Forwarded query {query_id} with status {query_data['status']}", extra={"source": "Databricks"})
                        else:
                            self.logger.warning(f"Skipping query {query_id} due to timeout or error", extra={"source": "Databricks"})
                else:
                    self.logger.info("No new Databricks queries found", extra={"source": "Databricks"})
            else:
                self.logger.error(f"Failed to fetch Databricks query history: {response.text}", extra={"source": "Databricks"})
        except Exception as e:
            self.logger.error(f"Error fetching Databricks queries: {e}", extra={"source": "Databricks"})
            with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] Error fetching Databricks queries: {e}\n{'-' * 60}\n")

    async def run_async(self):
        self.logger.info(f"Starting real-time log forwarding for Windows ({self.target_server}), Snowflake, and Databricks...", extra={"source": "System"})
        try:
            while True:
                self.fetch_and_forward_windows_logs()
                for log_type, time_col in self.LOG_CONFIG.items():
                    self.fetch_and_forward_snowflake_logs(log_type, time_col)
                await self.fetch_and_forward_databricks_logs()
                await asyncio.sleep(self.databricks_poll_interval)
        except asyncio.CancelledError:
            self.logger.info("Log forwarding stopped by user", extra={"source": "System"})
        finally:
            if self.conn:
                self.conn.close()
                self.logger.info("Snowflake connection closed", extra={"source": "Snowflake"})

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self.run_async())
        except KeyboardInterrupt:
            self.logger.info("Log forwarding stopped by user", extra={"source": "System"})
        finally:
            if self.conn:
                self.conn.close()
                self.logger.info("Snowflake connection closed", extra={"source": "Snowflake"})
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.close()

if __name__ == "__main__":
    forwarder = LogForwarderAgent()
    forwarder.run()