# init_db.py
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = "rules_engine"

async def init_database():
    """Initialize database with predefined rules"""
    client = AsyncIOMotorClient(MONGODB_URL)
    database = client[DATABASE_NAME]
    
    # Collections
    predefined_rules_collection = database["predefined_rules"]
    rules_collection = database["rules"]
    
    # Clear existing predefined rules
    await predefined_rules_collection.delete_many({})
    
    # Predefined rules data
    predefined_rules = [
        # Snowflake Rules
        {
            "name": "Query Failure Alert",
            "data_source": "snowflake",
            "condition": "Query fails 3 times in 10 minutes",
            "action": "Trigger ErrorAnalyzer",
            "priority": "High",
            "description": "Alerts when Snowflake queries fail repeatedly within a short timeframe"
        },
        {
            "name": "Long Running Query",
            "data_source": "snowflake",
            "condition": "Query duration > 5 minutes",
            "action": "Trigger Monitor & Notify",
            "priority": "Medium",
            "description": "Monitors and alerts for queries that take longer than expected"
        },
        {
            "name": "Connection Timeout",
            "data_source": "snowflake",
            "condition": "Connection timeout > 2 in 5 minutes",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Automatically attempts to fix connection timeout issues"
        },
        {
            "name": "Warehouse Suspension Alert",
            "data_source": "snowflake",
            "condition": "Warehouse suspended unexpectedly",
            "action": "Trigger ErrorAnalyzer",
            "priority": "High",
            "description": "Alerts when a Snowflake warehouse is suspended unexpectedly"
        },
        {
            "name": "Credit Usage Alert",
            "data_source": "snowflake",
            "condition": "Credit usage > 80% of daily limit",
            "action": "Notify Only",
            "priority": "Medium",
            "description": "Alerts when approaching daily credit usage limits"
        },
        
        # EKS Rules
        {
            "name": "Pod Crash Alert",
            "data_source": "eks",
            "condition": "Pod crash count > 2 in 5 minutes",
            "action": "Trigger ErrorAnalyzer",
            "priority": "High",
            "description": "Alerts when pods crash repeatedly in a short timeframe"
        },
        {
            "name": "Node Not Ready",
            "data_source": "eks",
            "condition": "Node status = NotReady for > 2 minutes",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Automatically attempts to fix nodes that are not ready"
        },
        {
            "name": "High CPU Usage",
            "data_source": "eks",
            "condition": "CPU usage > 90% for 5 minutes",
            "action": "Trigger Monitor & Scale",
            "priority": "Medium",
            "description": "Monitors and automatically scales resources when CPU usage is high"
        },
        {
            "name": "Memory Pressure Alert",
            "data_source": "eks",
            "condition": "Memory usage > 85% for 3 minutes",
            "action": "Trigger ErrorAnalyzer",
            "priority": "Medium",
            "description": "Alerts when memory usage exceeds safe thresholds"
        },
        {
            "name": "ImagePullBackOff Error",
            "data_source": "eks",
            "condition": "Pod status = ImagePullBackOff",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Automatically attempts to resolve image pull issues"
        },
        
        # Windows Rules
        {
            "name": "Event ID 7003 Alert",
            "data_source": "windows",
            "condition": "Event ID = 7003 occurs",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Automatically fixes service dependency issues (Event ID 7003)"
        },
        {
            "name": "Service Stop Alert",
            "data_source": "windows",
            "condition": "Critical service stops unexpectedly",
            "action": "Trigger ErrorAnalyzer & Fix",
            "priority": "High",
            "description": "Analyzes and fixes critical service stops"
        },
        {
            "name": "Disk Space Low",
            "data_source": "windows",
            "condition": "Disk space < 10%",
            "action": "Trigger Monitor & Cleanup",
            "priority": "Medium",
            "description": "Monitors disk space and performs cleanup when needed"
        },
        {
            "name": "Blue Screen Error",
            "data_source": "windows",
            "condition": "BSOD event logged",
            "action": "Trigger ErrorAnalyzer",
            "priority": "High",
            "description": "Analyzes Blue Screen of Death events for root cause"
        },
        {
            "name": "Windows Update Failure",
            "data_source": "windows",
            "condition": "Windows Update fails > 3 times",
            "action": "Trigger FixerAgent",
            "priority": "Medium",
            "description": "Automatically attempts to fix Windows Update issues"
        },
        
        # Linux Rules
        {
            "name": "Out of Memory Alert",
            "data_source": "linux",
            "condition": "Syslog contains 'Out of memory'",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Automatically attempts to free memory when OOM occurs"
        },
        {
            "name": "High Load Average",
            "data_source": "linux",
            "condition": "Load average > 5 for 3 minutes",
            "action": "Trigger Monitor & Analyze",
            "priority": "Medium",
            "description": "Monitors and analyzes high system load conditions"
        },
        {
            "name": "Failed Login Attempts",
            "data_source": "linux",
            "condition": "Failed login > 5 in 1 minute",
            "action": "Trigger Security Alert",
            "priority": "High",
            "description": "Security alert for potential brute force attacks"
        },
        {
            "name": "Disk I/O High",
            "data_source": "linux",
            "condition": "Disk I/O wait > 80% for 2 minutes",
            "action": "Trigger ErrorAnalyzer",
            "priority": "Medium",
            "description": "Analyzes high disk I/O conditions and bottlenecks"
        },
        {
            "name": "Systemd Service Failed",
            "data_source": "linux",
            "condition": "Systemd service fails to start",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Automatically attempts to restart failed systemd services"
        },
        
        # macOS Rules
        {
            "name": "Disk Full Alert",
            "data_source": "macos",
            "condition": "System.log has 'disk full'",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Automatically attempts to free disk space when disk is full"
        },
        {
            "name": "Kernel Panic",
            "data_source": "macos",
            "condition": "Kernel panic detected",
            "action": "Trigger ErrorAnalyzer",
            "priority": "High",
            "description": "Analyzes kernel panic events for root cause analysis"
        },
        {
            "name": "Application Crash",
            "data_source": "macos",
            "condition": "App crash > 3 in 10 minutes",
            "action": "Trigger Monitor & Fix",
            "priority": "Medium",
            "description": "Monitors and attempts to fix repeatedly crashing applications"
        },
        {
            "name": "Memory Pressure Warning",
            "data_source": "macos",
            "condition": "Memory pressure = yellow/red",
            "action": "Trigger Monitor & Analyze",
            "priority": "Medium",
            "description": "Monitors and analyzes memory pressure conditions"
        },
        {
            "name": "Time Machine Backup Failed",
            "data_source": "macos",
            "condition": "Time Machine backup fails > 2 times",
            "action": "Trigger FixerAgent",
            "priority": "Medium",
            "description": "Automatically attempts to fix Time Machine backup issues"
        }
    ]
    
    # Insert predefined rules
    if predefined_rules:
        result = await predefined_rules_collection.insert_many(predefined_rules)
        print(f"Inserted {len(result.inserted_ids)} predefined rules")
    
    # Create some sample active rules for demonstration
    sample_rules = [
        {
            "name": "Snowflake Query Timeout",
            "type": "Predefined",
            "data_source": "snowflake",
            "condition": "Query fails 3 times in 10 minutes",
            "action": "Trigger ErrorAnalyzer",
            "status": "Active",
            "priority": "High",
            "notification": "Email",
            "real_time": True,
            "last_triggered": datetime(2025, 1, 28, 10, 30, 0),
            "created_at": datetime(2025, 1, 15, 9, 0, 0),
            "updated_at": datetime(2025, 1, 28, 10, 30, 0)
        },
        {
            "name": "EKS Pod Failure Custom",
            "type": "Custom",
            "data_source": "eks",
            "condition": "Pod restart > 5 in 15 minutes",
            "action": "Trigger FixerAgent",
            "status": "Active",
            "priority": "Medium",
            "notification": "Slack",
            "real_time": True,
            "last_triggered": datetime(2025, 1, 28, 9, 15, 0),
            "created_at": datetime(2025, 1, 20, 14, 30, 0),
            "updated_at": datetime(2025, 1, 28, 9, 15, 0)
        },
        {
            "name": "Windows Service Monitor",
            "type": "Predefined",
            "data_source": "windows",
            "condition": "Event ID = 7003",
            "action": "Trigger FixerAgent",
            "status": "Inactive",
            "priority": "High",
            "notification": "Email",
            "real_time": False,
            "last_triggered": None,
            "created_at": datetime(2025, 1, 10, 11, 0, 0),
            "updated_at": datetime(2025, 1, 25, 16, 45, 0)
        }
    ]
    
    # Clear existing rules
    await rules_collection.delete_many({})
    
    # Insert sample rules
    if sample_rules:
        result = await rules_collection.insert_many(sample_rules)
        print(f"Inserted {len(result.inserted_ids)} sample rules")
    
    # Create indexes for better performance
    await rules_collection.create_index("data_source")
    await rules_collection.create_index("status")
    await rules_collection.create_index("type")
    await rules_collection.create_index([("name", "text"), ("condition", "text")])
    
    await predefined_rules_collection.create_index("data_source")
    
    print("Database initialization completed successfully!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(init_database())