from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import threading
import sys
import os
from dotenv import load_dotenv
from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager
from agent import ErrorAnalyzerAgent
from fixer import FixerAgent
from log_forwarder import LogForwarderAgent
from monitor import MonitorAgent
from email_agent import EmailAgent
from utils import setup_logging
import json
import asyncio
from typing import List
from starlette.websockets import WebSocketState
from starlette.exceptions import WebSocketException

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.websocket_clients = set()
        self.MAX_CLIENTS = 100
        self.HEARTBEAT_INTERVAL = 30
        self.WEBSOCKET_TIMEOUT = 60

    async def connect(self, websocket: WebSocket):
        if len(self.websocket_clients) >= self.MAX_CLIENTS:
            await websocket.close(code=1011)
            return False
        await websocket.accept()
        self.websocket_clients.add(websocket)
        return True

    def disconnect(self, websocket: WebSocket):
        if isinstance(self.websocket_clients, set):
            self.websocket_clients.discard(websocket)
        else:
            print(f"Cannot disconnect client, websocket_clients is {type(self.websocket_clients)}", file=sys.stderr)

    async def broadcast(self, message: dict):
        if not self.websocket_clients:
            print("No WebSocket clients to broadcast to", file=sys.stderr)
            return
        suppress_prints = message.get('agent') == 'LogForwarder'
        if not suppress_prints:
            print(f"Broadcasting message: {message}", file=sys.stderr)
        clients_to_remove = set()
        for client in self.websocket_clients.copy():
            try:
                if client.client_state != WebSocketState.CONNECTED:
                    print(f"Client {client.client} is not connected, marking for removal", file=sys.stderr)
                    clients_to_remove.add(client)
                    continue
                await client.send_json(message)
                if not suppress_prints:
                    print(f"Message sent successfully to client {client.client}", file=sys.stderr)
            except WebSocketDisconnect:
                print(f"Client {client.client} disconnected during broadcast", file=sys.stderr)
                clients_to_remove.add(client)
            except WebSocketException as e:
                print(f"WebSocket protocol error during broadcast: {str(e)}", file=sys.stderr)
                clients_to_remove.add(client)
            except RuntimeError as e:
                if "close message has been sent" in str(e) or "WebSocket is not connected" in str(e):
                    print(f"Attempted to send to closed WebSocket {client.client}", file=sys.stderr)
                    clients_to_remove.add(client)
                else:
                    print(f"Runtime error broadcasting to WebSocket {client.client}: {str(e)}", file=sys.stderr)
                    clients_to_remove.add(client)
            except Exception as e:
                print(f"Unexpected error broadcasting to WebSocket {client.client}: {str(e)}", file=sys.stderr)
                clients_to_remove.add(client)
        if clients_to_remove:
            self.websocket_clients.difference_update(clients_to_remove)
            print(f"Removed {len(clients_to_remove)} disconnected clients", file=sys.stderr)

manager = ConnectionManager()

# Configure global logging before initializing agents
setup_logging(ws_manager=manager)

llm_config = {
    "config_list": [
        {
            "model": "gpt-4o",
            "api_key": os.getenv("OPEN_API_KEY"),
            "base_url": "https://api.openai.com/v1"
        }
    ]
}

# Global variables to store agent instances
agents = {
    "error_analyzer": None,
    "fixer_agent": None,
    "monitor_agent": None,
    "forwarder_agent": None,
    "email_agent": None,
    "user_proxy": None,
    "group_chat": None,
    "chat_manager": None
}

@app.get("/start-agents")
def start_agents(mode: str = Query("semi-autonomous", enum=["semi-autonomous", "autonomous"])):
    try:
        global agents

        # Initialize agents based on mode
        agents["error_analyzer"] = ErrorAnalyzerAgent(name="ErrorAnalyzerAgent", llm_config=llm_config, ws_manager=manager)
        agents["fixer_agent"] = FixerAgent(name="FixerAgent", llm_config=llm_config, analyzer_agent=agents["error_analyzer"], ws_manager=manager)
        agents["error_analyzer"].fixer_agent = agents["fixer_agent"]
        agents["forwarder_agent"] = LogForwarderAgent(name="LogForwarderAgent", llm_config=llm_config, ws_manager=manager)

        if mode == "semi-autonomous":
            agents["email_agent"] = EmailAgent(name="EmailAgent", llm_config=llm_config, analyzer_agent=agents["error_analyzer"], ws_manager=manager)
            agents["monitor_agent"] = MonitorAgent(
                name="MonitorAgent",
                llm_config=llm_config,
                analyzer_agent=agents["error_analyzer"],
                email_agent=agents["email_agent"],
                ws_manager=manager,
                mode=mode
            )
            agents["user_proxy"] = UserProxyAgent(
                name="Supervisor",
                code_execution_config={"use_docker": False},
                human_input_mode="NEVER"
            )
            agents["group_chat"] = GroupChat(agents=[agents["user_proxy"], agents["error_analyzer"], agents["fixer_agent"], agents["email_agent"]], messages=[], max_round=5)
            agents["chat_manager"] = GroupChatManager(groupchat=agents["group_chat"], llm_config=llm_config)
        else:  # autonomous mode
            agents["monitor_agent"] = MonitorAgent(
                name="MonitorAgent",
                llm_config=llm_config,
                analyzer_agent=agents["error_analyzer"],
                email_agent=None,
                ws_manager=manager,
                mode=mode
            )

        # Start agents
        if agents["forwarder_agent"] and agents["forwarder_agent"].conn:
            threading.Thread(target=agents["forwarder_agent"].run, daemon=True).start()
        if agents["monitor_agent"]:
            threading.Thread(target=agents["monitor_agent"].run, daemon=True).start()
        if mode == "semi-autonomous" and agents["email_agent"]:
            threading.Thread(target=agents["email_agent"].run, daemon=True).start()
        if agents["error_analyzer"]:
            threading.Thread(target=agents["error_analyzer"].run, daemon=True).start()
        if agents["fixer_agent"]:
            threading.Thread(target=agents["fixer_agent"].run, daemon=True).start()

        return {"status": f"All agents started successfully in {mode} mode"}
    except Exception as e:
        return {"status": f"Failed to start agents: {str(e)}"}

@app.get("/stop-agents")
def stop_agents():
    try:
        global agents
        stopped_agents = []

        # Stop each agent's run loop if it has a stop method
        for agent_name, agent in agents.items():
            if agent and hasattr(agent, 'stop'):
                try:
                    agent.stop()
                    stopped_agents.append(agent_name)
                except Exception as e:
                    print(f"Error stopping {agent_name}: {str(e)}", file=sys.stderr)

        # Clear agent references
        for agent_name in agents:
            agents[agent_name] = None

        return {"status": f"Stopped agents: {', '.join(stopped_agents) if stopped_agents else 'No agents were running'}"}
    except Exception as e:
        return {"status": f"Failed to stop agents: {str(e)}"}

@app.get("/start-logging")
def start_logging():
    if agents["user_proxy"] and agents["chat_manager"]:
        agents["user_proxy"].initiate_chat(
            agents["chat_manager"],
            message="Start analyzing logs and fixing issues."
        )
        return {"status": "Chat initiated"}
    return {"status": "Failed to initiate chat due to missing agents"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        if not await manager.connect(websocket):
            return
        print(f"WebSocket connection accepted: {websocket.client}", file=sys.stderr)
        await websocket.send_json({"type": "ping"})
        async def heartbeat():
            while websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await websocket.send_json({"type": "ping"})
                    print("Sent heartbeat ping", file=sys.stderr)
                    await asyncio.sleep(manager.HEARTBEAT_INTERVAL)
                except Exception as e:
                    print(f"Heartbeat failed: {str(e)}", file=sys.stderr)
                    break
        heartbeat_task = asyncio.create_task(heartbeat())
        try:
            while True:
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=manager.WEBSOCKET_TIMEOUT)
                    print(f"Received WebSocket message: {data}", file=sys.stderr)
                    if data == "pong":
                        print("Received pong response", file=sys.stderr)
                except asyncio.TimeoutError:
                    print("WebSocket receive timeout, sending ping to check connection", file=sys.stderr)
                    await websocket.send_json({"type": "ping"})
                    continue
                except WebSocketDisconnect:
                    print("WebSocket disconnected normally", file=sys.stderr)
                    break
                except WebSocketException as e:
                    print(f"WebSocket protocol error: {str(e)}", file=sys.stderr)
                    break
                except Exception as e:
                    print(f"Unexpected WebSocket error: {str(e)}", file=sys.stderr)
                    break
        finally:
            heartbeat_task.cancel()
            manager.disconnect(websocket)
            print("WebSocket connection cleaned up", file=sys.stderr)
    except Exception as e:
        print(f"WebSocket connection setup error: {str(e)}", file=sys.stderr)
        manager.disconnect(websocket)
# main.py
from fastapi import FastAPI, HTTPException, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
import os
from enum import Enum

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = "rules_engine"

client = AsyncIOMotorClient(MONGODB_URL)
database = client[DATABASE_NAME]
rules_collection = database["rules"]
predefined_rules_collection = database["predefined_rules"]

# Enums
class DataSource(str, Enum):
    SNOWFLAKE = "snowflake"
    EKS = "eks"
    WINDOWS = "windows"
    LINUX = "linux"
    DATABRICKS = "databricks"

class RuleType(str, Enum):
    PREDEFINED = "Predefined"
    CUSTOM = "Custom"

class RuleStatus(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"

class Priority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"

class ActionType(str, Enum):
    NOTIFY = "Notify Only"
    ANALYZE = "Trigger ErrorAnalyzer"
    FIX = "Trigger FixerAgent"
    ANALYZE_FIX = "Analyze & Fix"

class NotificationType(str, Enum):
    EMAIL = "Email"
    SLACK = "Slack"
    BOTH = "Both"

from pydantic import GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(
        cls, core_schema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        schema = handler(core_schema)
        schema.update(type="string", example="650c0a4b5d6e2b7f9c9e1234")
        return schema

class Rule(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    name: str
    type: RuleType
    data_source: DataSource
    condition: str
    action: ActionType
    status: RuleStatus = RuleStatus.ACTIVE
    priority: Priority = Priority.MEDIUM
    notification: Optional[NotificationType] = NotificationType.EMAIL
    real_time: bool = True
    last_triggered: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class PredefinedRule(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    name: str
    data_source: DataSource
    condition: str
    action: ActionType
    priority: Priority = Priority.MEDIUM
    description: Optional[str] = None

    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class CreateRuleRequest(BaseModel):
    name: str
    type: RuleType
    data_source: DataSource
    condition: str
    action: ActionType
    priority: Priority = Priority.MEDIUM
    notification: NotificationType = NotificationType.EMAIL
    real_time: bool = True

class UpdateRuleRequest(BaseModel):
    name: Optional[str] = None
    condition: Optional[str] = None
    action: Optional[ActionType] = None
    status: Optional[RuleStatus] = None
    priority: Optional[Priority] = None
    notification: Optional[NotificationType] = None
    real_time: Optional[bool] = None

class NLPParseRequest(BaseModel):
    text: str

class NLPParseResponse(BaseModel):
    data_source: DataSource
    condition: str
    action: ActionType
    priority: Priority
    notification: NotificationType

# Helper function to convert MongoDB document to dict
def rule_helper(rule) -> dict:
    return {
        "id": str(rule["_id"]),
        "name": rule["name"],
        "type": rule["type"],
        "data_source": rule["data_source"],
        "condition": rule["condition"],
        "action": rule["action"],
        "status": rule["status"],
        "priority": rule["priority"],
        "notification": rule.get("notification", "Email"),
        "real_time": rule.get("real_time", True),
        "last_triggered": rule.get("last_triggered"),
        "created_at": rule["created_at"],
        "updated_at": rule["updated_at"]
    }

def predefined_rule_helper(rule) -> dict:
    return {
        "id": str(rule["_id"]),
        "name": rule["name"],
        "data_source": rule["data_source"],
        "condition": rule["condition"],
        "action": rule["action"],
        "priority": rule["priority"],
        "description": rule.get("description", "")
    }



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Rules Engine API"}

# Rules CRUD Operations

@app.get("/api/rules", response_model=List[dict])
async def get_rules(
    data_source: Optional[DataSource] = Query(None, description="Filter by data source"),
    status: Optional[RuleStatus] = Query(None, description="Filter by status"),
    type: Optional[RuleType] = Query(None, description="Filter by type"),
    search: Optional[str] = Query(None, description="Search in name or condition")
):
    """Get all rules with optional filtering"""
    filter_query = {}
    
    if data_source:
        filter_query["data_source"] = data_source
    if status:
        filter_query["status"] = status
    if type:
        filter_query["type"] = type
    if search:
        filter_query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"condition": {"$regex": search, "$options": "i"}}
        ]
    
    rules = []
    async for rule in rules_collection.find(filter_query).sort("created_at", -1):
        rules.append(rule_helper(rule))
    
    return rules

@app.get("/api/rules/{rule_id}", response_model=dict)
async def get_rule(rule_id: str = Path(..., description="Rule ID")):
    """Get a specific rule by ID"""
    if not ObjectId.is_valid(rule_id):
        raise HTTPException(status_code=400, detail="Invalid rule ID")
    
    rule = await rules_collection.find_one({"_id": ObjectId(rule_id)})
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return rule_helper(rule)

@app.post("/api/rules", response_model=dict, status_code=201)
async def create_rule(rule: CreateRuleRequest):
    """Create a new rule"""
    rule_dict = rule.dict()
    rule_dict["created_at"] = datetime.utcnow()
    rule_dict["updated_at"] = datetime.utcnow()
    rule_dict["status"] = RuleStatus.ACTIVE
    
    result = await rules_collection.insert_one(rule_dict)
    created_rule = await rules_collection.find_one({"_id": result.inserted_id})
    
    return rule_helper(created_rule)

@app.put("/api/rules/{rule_id}", response_model=dict)
async def update_rule(rule_id: str, rule_update: UpdateRuleRequest):
    """Update an existing rule"""
    if not ObjectId.is_valid(rule_id):
        raise HTTPException(status_code=400, detail="Invalid rule ID")
    
    update_data = {k: v for k, v in rule_update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    update_data["updated_at"] = datetime.utcnow()
    
    result = await rules_collection.update_one(
        {"_id": ObjectId(rule_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    updated_rule = await rules_collection.find_one({"_id": ObjectId(rule_id)})
    return rule_helper(updated_rule)

@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: str):
    """Delete a rule"""
    if not ObjectId.is_valid(rule_id):
        raise HTTPException(status_code=400, detail="Invalid rule ID")
    
    result = await rules_collection.delete_one({"_id": ObjectId(rule_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return {"message": "Rule deleted successfully"}

@app.patch("/api/rules/{rule_id}/toggle", response_model=dict)
async def toggle_rule_status(rule_id: str):
    """Toggle rule status between Active and Inactive"""
    if not ObjectId.is_valid(rule_id):
        raise HTTPException(status_code=400, detail="Invalid rule ID")
    
    rule = await rules_collection.find_one({"_id": ObjectId(rule_id)})
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    new_status = RuleStatus.INACTIVE if rule["status"] == RuleStatus.ACTIVE else RuleStatus.ACTIVE
    
    await rules_collection.update_one(
        {"_id": ObjectId(rule_id)},
        {"$set": {"status": new_status, "updated_at": datetime.utcnow()}}
    )
    
    updated_rule = await rules_collection.find_one({"_id": ObjectId(rule_id)})
    return rule_helper(updated_rule)

# Predefined Rules Operations

@app.get("/api/predefined-rules", response_model=List[dict])
async def get_predefined_rules(
    data_source: Optional[DataSource] = Query(None, description="Filter by data source")
):
    """Get predefined rules, optionally filtered by data source"""
    filter_query = {}
    if data_source:
        filter_query["data_source"] = data_source
    
    rules = []
    async for rule in predefined_rules_collection.find(filter_query):
        rules.append(predefined_rule_helper(rule))
    
    return rules

@app.post("/api/predefined-rules/{predefined_rule_id}/activate", response_model=dict, status_code=201)
async def activate_predefined_rule(predefined_rule_id: str):
    """Activate a predefined rule by creating a new rule from it"""
    if not ObjectId.is_valid(predefined_rule_id):
        raise HTTPException(status_code=400, detail="Invalid predefined rule ID")
    
    predefined_rule = await predefined_rules_collection.find_one({"_id": ObjectId(predefined_rule_id)})
    if not predefined_rule:
        raise HTTPException(status_code=404, detail="Predefined rule not found")
    
    # Create new rule from predefined rule
    new_rule = {
        "name": predefined_rule["name"],
        "type": RuleType.PREDEFINED,
        "data_source": predefined_rule["data_source"],
        "condition": predefined_rule["condition"],
        "action": predefined_rule["action"],
        "priority": predefined_rule["priority"],
        "status": RuleStatus.ACTIVE,
        "notification": NotificationType.EMAIL,
        "real_time": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await rules_collection.insert_one(new_rule)
    created_rule = await rules_collection.find_one({"_id": result.inserted_id})
    
    return rule_helper(created_rule)

# NLP Parse Endpoint (Mock implementation)

@app.post("/api/parse-nlp", response_model=NLPParseResponse)
async def parse_nlp_rule(request: NLPParseRequest):
    """Parse natural language text into a structured rule (mock implementation)"""
    text = request.text.lower()
    
    # Simple keyword-based parsing (replace with actual NLP service)
    data_source = DataSource.SNOWFLAKE
    if "eks" in text or "kubernetes" in text or "pod" in text:
        data_source = DataSource.EKS
    elif "windows" in text or "event id" in text:
        data_source = DataSource.WINDOWS
    elif "linux" in text or "syslog" in text:
        data_source = DataSource.LINUX
    elif "databricks" in text or "cluster" in text or "spark" in text or "notebook" in text:
        data_source = DataSource.DATABRICKS
    
    priority = Priority.MEDIUM
    if "critical" in text or "urgent" in text:
        priority = Priority.HIGH
    elif "low" in text or "minor" in text:
        priority = Priority.LOW
    
    action = ActionType.NOTIFY
    if "fix" in text or "resolve" in text:
        action = ActionType.FIX
    elif "analyze" in text:
        action = ActionType.ANALYZE
    
    # Extract condition (simplified)
    condition = f"Parsed from: {request.text[:100]}"
    
    return NLPParseResponse(
        data_source=data_source,
        condition=condition,
        action=action,
        priority=priority,
        notification=NotificationType.EMAIL
    )

# Data Source Statistics

@app.get("/api/stats/rules-by-source")
async def get_rules_stats_by_source():
    """Get rule statistics grouped by data source"""
    pipeline = [
        {
            "$group": {
                "_id": "$data_source",
                "total": {"$sum": 1},
                "active": {
                    "$sum": {
                        "$cond": [{"$eq": ["$status", "Active"]}, 1, 0]
                    }
                },
                "inactive": {
                    "$sum": {
                        "$cond": [{"$eq": ["$status", "Inactive"]}, 1, 0]
                    }
                }
            }
        }
    ]
    
    stats = []
    async for stat in rules_collection.aggregate(pipeline):
        stats.append({
            "data_source": stat["_id"],
            "total": stat["total"],
            "active": stat["active"],
            "inactive": stat["inactive"]
        })
    
    return stats

# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        await database.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)