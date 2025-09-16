#main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
import json
import asyncio
from typing import List
from starlette.websockets import WebSocketState
from starlette.exceptions import WebSocketException

load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",  # Your frontend URL
        "http://127.0.0.1:8080",  # Alternative localhost format
        "http://localhost:3000",  # Common React dev server port (if you switch)
    ],
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allows all headers
)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.websocket_clients = set()
        self.MAX_CLIENTS = 100
        self.HEARTBEAT_INTERVAL = 30
        self.WEBSOCKET_TIMEOUT = 60

    async def connect(self, websocket: WebSocket):
        if len(self.websocket_clients) >= self.MAX_CLIENTS:
            await websocket.close(code=1011)  # Server overloaded
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
        print(f"Broadcasting message: {message}", file=sys.stderr)
        clients_to_remove = set()
        for client in self.websocket_clients.copy():
            try:
                if client.client_state != WebSocketState.CONNECTED:
                    print(f"Client {client.client} is not connected, marking for removal", file=sys.stderr)
                    clients_to_remove.add(client)
                    continue
                await client.send_json(message)
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

llm_config = {
    "config_list": [
        {
            "model": "gpt-4o",
            "api_key": os.getenv("OPEN_API_KEY"),
            "base_url": "https://api.openai.com/v1"
        }
    ]
}

# Initialize agents with error handling
error_analyzer = None
fixer_agent = None
monitor_agent = None
forwarder_agent = None
try:
    error_analyzer = ErrorAnalyzerAgent(name="ErrorAnalyzerAgent", llm_config=llm_config, ws_manager=manager)
    fixer_agent = FixerAgent(name="FixerAgent", llm_config=llm_config, analyzer_agent=error_analyzer, ws_manager=manager)
    error_analyzer.fixer_agent = fixer_agent
    monitor_agent = MonitorAgent(name="MonitorAgent", llm_config=llm_config, analyzer_agent=error_analyzer, ws_manager=manager)
    forwarder_agent = LogForwarderAgent(name="LogForwarderAgent", llm_config=llm_config)
except Exception as e:
    print(f"Failed to initialize one or more agents: {e}", file=sys.stderr)

user_proxy = UserProxyAgent(
    name="Supervisor",
    code_execution_config={"use_docker": False},
    human_input_mode="NEVER"
)

group_chat = GroupChat(agents=[user_proxy, error_analyzer, fixer_agent], messages=[], max_round=5)
chat_manager = GroupChatManager(groupchat=group_chat, llm_config=llm_config)

@app.get("/start-logging")
def start_logging():
    if user_proxy and chat_manager:
        user_proxy.initiate_chat(
            chat_manager,
            message="Start analyzing logs and fixing issues."
        )
        return {"status": "Chat initiated"}
    return {"status": "Failed to initiate chat due to missing agents"}

@app.get("/start-agents")
def start_agents():
    try:
        if forwarder_agent and forwarder_agent.conn:
            threading.Thread(target=forwarder_agent.run, daemon=True).start()
        if monitor_agent:
            threading.Thread(target=monitor_agent.run, daemon=True).start()
        if error_analyzer:
            threading.Thread(target=error_analyzer.run, daemon=True).start()
        if fixer_agent:
            threading.Thread(target=fixer_agent.run, daemon=True).start()
        return {"status": "All agents started successfully"}
    except Exception as e:
        return {"status": f"Failed to start agents: {str(e)}"}


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