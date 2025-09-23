# monitor.py
import boto3
import time
import logging
import json
import os
import uuid
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from pymongo import MongoClient
from openai import OpenAI

from autogen import AssistantAgent

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = "rules_engine"
MONGO_COLLECTION_NAME = "rules"
OPENAI_API_KEY = os.getenv("OPEN_API_KEY")

class MonitorAgent(AssistantAgent):
    def __init__(self, name, llm_config, analyzer_agent=None, ws_manager=None):
        super().__init__(name=name, llm_config=llm_config)
        
        # --- Basic Setup ---
        self.analyzer_agent = analyzer_agent
        self.ws_manager = ws_manager
        self.setup_logging()
        
        # --- LLM Client for Rule Translation ---
        if not OPENAI_API_KEY:
            raise ValueError("OPEN_API_KEY is not set in the environment variables.")
        self.llm_client = OpenAI(api_key=OPENAI_API_KEY)

        # --- MongoDB Connection for Rules ---
        self.db_client = MongoClient(MONGO_URI)
        self.db = self.db_client[MONGO_DB_NAME]
        self.rules_collection = self.db[MONGO_COLLECTION_NAME]
        self.active_rules = []

        # --- AWS Boto3 Clients ---
        # A dictionary to hold clients for different regions, initialized on demand
        self.boto_clients = {}
        self.data_source_config = {
            "windows": {"region": "us-east-1", "log_prefix": "/windows/"},
            "eks": {"region": "ap-south-1", "log_prefix": "/aws/eks/crash-fix-cluster/"},
            "snowflake": {"region": "us-east-2", "log_prefix": "/snowflake/"},
            # Add other data sources and their default AWS configs here
        }

        # --- State Management ---
        self.seen_event_ids = set()
        self.startup_time = int(time.time() * 1000)
        
    def setup_logging(self):
        """Initializes the logger."""
        self.logger = logging.getLogger("MONITOR")
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler("C:/Users/Quadrant/Loganalytics/Backend/monitor_agent.log"),
                logging.StreamHandler()
            ]
        )

    def _get_boto_client(self, region_name):
        """Creates or retrieves a boto3 client for a specific region."""
        if region_name not in self.boto_clients:
            self.logger.info(f"Initializing Boto3 client for region: {region_name}")
            self.boto_clients[region_name] = boto3.client("logs", region_name=region_name)
        return self.boto_clients[region_name]

    def _load_active_rules(self):
        """Fetches active monitoring rules from MongoDB."""
        self.logger.info("Fetching active rules from MongoDB...")
        try:
            self.active_rules = list(self.rules_collection.find({"status": "Active"}))
            self.logger.info(f"Successfully loaded {len(self.active_rules)} active rules.")
        except Exception as e:
            self.logger.error(f"Failed to connect to MongoDB and load rules: {e}")
            self.active_rules = []

    def _get_filter_pattern_from_llm(self, condition, data_source):
        """Uses an LLM to convert a human-readable condition into a CloudWatch filter pattern."""
        self.logger.info(f"Generating filter pattern for condition: '{condition}'")
        try:
            prompt = f"""
            You are an expert in AWS CloudWatch Logs. Your task is to convert a human-readable monitoring condition 
            into a valid CloudWatch Logs `filterPattern`.

            The data source is '{data_source}'.
            The condition is: '{condition}'.

            Provide the output as a JSON object with a single key, "filterPattern".

            Examples:
            1. Condition: "Event ID = 7003" for "windows" source -> {{"filterPattern": "{{ $.EventID = 7003 }}"}}
            2. Condition: "Pod restart > 5 in 15 minutes" for "eks" source -> {{"filterPattern": "Back-off restarting failed container"}}
            3. Condition: "Find logs containing 'OOMKilled'" for "eks" source -> {{"filterPattern": "OOMKilled"}}
            4. Condition: "SQL execution error" for "snowflake" source -> {{"filterPattern": "?ERROR ?\"EXECUTION_STATUS: FAILED\""}}
            
            Now, generate the filter pattern for the given condition.
            """
            
            response = self.llm_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            
            result = json.loads(response.choices[0].message.content)
            filter_pattern = result.get("filterPattern")

            if filter_pattern:
                self.logger.info(f"Generated filter pattern: '{filter_pattern}'")
                return filter_pattern
            else:
                self.logger.warning(f"LLM could not generate a valid filter pattern for condition: '{condition}'")
                return None

        except Exception as e:
            self.logger.error(f"Error calling LLM or parsing response: {e}")
            return None

    async def _search_logs_with_rule(self, rule):
        """Generic function to search logs based on a dynamic rule."""
        data_source = rule.get('data_source')
        condition = rule.get('condition')
        
        config = self.data_source_config.get(data_source)
        if not config:
            self.logger.warning(f"No configuration found for data source: '{data_source}'. Skipping rule '{rule.get('name')}'.")
            return

        # 1. Generate Filter Pattern using LLM
        filter_pattern = self._get_filter_pattern_from_llm(condition, data_source)
        if not filter_pattern:
            return # Stop if no valid pattern was generated

        # 2. Find and Search Log Groups
        try:
            boto_client = self._get_boto_client(config['region'])
            paginator = boto_client.get_paginator('describe_log_groups')
            
            log_groups_to_search = []
            for page in paginator.paginate(logGroupNamePrefix=config['log_prefix']):
                for group in page['logGroups']:
                    log_groups_to_search.append(group['logGroupName'])
            
            self.logger.info(f"Found {len(log_groups_to_search)} log groups for prefix '{config['log_prefix']}'")

            for log_group in log_groups_to_search:
                await self._execute_search(boto_client, log_group, filter_pattern, rule)

        except Exception as e:
            self.logger.error(f"Error searching logs for rule '{rule.get('name')}': {e}")
            
    async def _execute_search(self, client, log_group, filter_pattern, rule):
        """Executes the CloudWatch search and triggers the workflow if events are found."""
        try:
            now = int(time.time() * 1000)
            response = client.filter_log_events(
                logGroupName=log_group,
                startTime=self.startup_time,
                endTime=now,
                filterPattern=filter_pattern,
                limit=10 # Limit to avoid overwhelming the system
            )
            
            for event in response.get("events", []):
                event_id = event.get("eventId")
                if event_id in self.seen_event_ids:
                    continue
                self.seen_event_ids.add(event_id)
                
                # --- An error is detected, trigger the standard workflow ---
                self.logger.error(f"Error detected by rule '{rule.get('name')}' in log group '{log_group}'")

                ref = str(uuid.uuid4())
                timestamp = datetime.now().strftime("%H:%M:%S")
                
                error_message = (
                    f"Dynamic Alert Triggered\n"
                    f"Rule Name: {rule.get('name')}\n"
                    f"Data Source: {rule.get('data_source')}\n"
                    f"LogGroup: {log_group}\n"
                    f"Message: {event.get('message')}\n"
                    f"Reference: {ref}"
                )
                
                details = (
                    f"Error detected based on rule: '{rule.get('name')}'\n\n"
                    f"Condition: '{rule.get('condition')}'"
                )
                
                # 1. Broadcast via WebSocket
                await self._async_broadcast("MonitorAgent", "error detected", timestamp, details, ref)

                # 2. Log to file
                with open(f"C:/Users/Quadrant/Loganalytics/Backend/{rule.get('data_source')}_errors.log", "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.now()}] {error_message}\n{'-' * 80}\n")
                
                # 3. Trigger Analyzer Agent
                if self.analyzer_agent:
                    analysis_result = self.analyzer_agent.analyze_error(error_message, source=rule.get('data_source'))
                    analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                    analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                    await self._async_broadcast("ErrorAnalyzer", "analysis complete", analysis_timestamp, analysis_details, ref)

                    # 4. Write to fix_queue.json for FixerAgent
                    output = {
                        "reference": ref,
                        "error": error_message,
                        "root_cause": analysis_result.get("root_cause", "Unknown"),
                        "remediation_steps": analysis_result.get("remediation_steps", []),
                        "source": rule.get('data_source')
                    }
                    with open("C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                        json.dump(output, out, indent=4)
                    self.analyzer_agent.logger.info(f"Analysis result for reference {ref} written to fix_queue.json")

        except Exception as e:
            self.logger.error(f"Failed during log event execution for '{log_group}': {e}")


    async def broadcast_message(self, agent, status, timestamp, details, reference):
        """Broadcasts a message to connected WebSocket clients."""
        message = {
            "agent": agent, "status": status, "time": timestamp,
            "details": details, "reference": reference
        }
        self.logger.info(f"Broadcasting message: {json.dumps(message)}")
        if self.ws_manager:
            await self.ws_manager.broadcast(message)

    async def _async_broadcast(self, agent, status, timestamp, details, reference):
        await self.broadcast_message(agent, status, timestamp, details, reference)

    async def run_async(self):
        """The main asynchronous monitoring loop."""
        self.logger.info("Starting dynamic monitoring based on rules from MongoDB...")
        
        # Load rules at startup
        self._load_active_rules()
        
        if not self.active_rules:
            self.logger.error("No active rules found. Monitoring will not proceed.")
            return

        try:
            while True:
                # Periodically reload rules, e.g., every 5 minutes
                # For now, we load once at startup, but this is where you'd add reloading logic.
                
                self.logger.info("--- Starting new monitoring cycle ---")
                tasks = [self._search_logs_with_rule(rule) for rule in self.active_rules]
                await asyncio.gather(*tasks)
                
                self.logger.info("--- Monitoring cycle complete. Waiting for next interval. ---")
                await asyncio.sleep(60)  # Check every 60 seconds

        except asyncio.CancelledError:
            self.logger.info("Monitoring stopped by user.")
        except Exception as e:
            self.logger.critical(f"A critical error occurred in the main monitoring loop: {e}", exc_info=True)
        finally:
            self.db_client.close()
            self.logger.info("MongoDB connection closed.")

    def run(self):
        """Synchronous wrapper for running the async monitor loop."""
        try:
            asyncio.run(self.run_async())
        except KeyboardInterrupt:
            self.logger.info("Monitoring agent shut down.")

# --- Main execution block remains the same ---
if __name__ == "__main__":
    from agent import ErrorAnalyzerAgent # Assuming agent.py exists in the same directory
    
    llm_config = {"model": "gpt-4o", "api_key": os.getenv("OPEN_API_KEY")}
    
    analyzer_agent = ErrorAnalyzerAgent(name="ErrorAnalyzerAgent", llm_config=llm_config)
    monitor = MonitorAgent(name="MonitorAgent", llm_config=llm_config, analyzer_agent=analyzer_agent)
    
    monitor.run()