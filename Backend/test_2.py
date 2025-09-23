import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = "rules_engine"

async def init_database():
    """Initialize database with predefined rules for Databricks"""
    client = AsyncIOMotorClient(MONGODB_URL)
    database = client[DATABASE_NAME]
    
    # Collections
    predefined_rules_collection = database["predefined_rules"]
    
    # Clear existing predefined rules
    await predefined_rules_collection.delete_many({})
    
    # Predefined rules for Databricks
    predefined_rules = [
        {
            "id": str(uuid.uuid4()),
            "name": "Cluster Failure Alert",
            "data_source": "databricks",
            "condition": "Cluster status = TERMINATED_WITH_ERRORS",
            "action": "Trigger ErrorAnalyzer",
            "priority": "High",
            "description": "Alerts when a Databricks cluster terminates with errors"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Job Failure Alert",
            "data_source": "databricks",
            "condition": "Job run fails > 3 times in 1 hour",
            "action": "Trigger FixerAgent",
            "priority": "High",
            "description": "Monitors and attempts to fix repeated job failures in Databricks"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Long Running Notebook",
            "data_source": "databricks",
            "condition": "Notebook execution time > 30 minutes",
            "action": "Trigger Monitor & Notify",
            "priority": "Medium",
            "description": "Alerts when a notebook runs longer than expected"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "DBFS Storage Limit",
            "data_source": "databricks",
            "condition": "DBFS storage usage > 90%",
            "action": "Trigger Monitor & Cleanup",
            "priority": "Medium",
            "description": "Monitors and initiates cleanup when DBFS storage nears capacity"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Spark Job Latency",
            "data_source": "databricks",
            "condition": "Spark job latency > 5 seconds for 10 minutes",
            "action": "Trigger ErrorAnalyzer",
            "priority": "Medium",
            "description": "Analyzes high latency in Spark jobs for performance issues"
        }
    ]
    
    # Insert predefined rules
    if predefined_rules:
        result = await predefined_rules_collection.insert_many(predefined_rules)
        print(f"Inserted {len(result.inserted_ids)} predefined rules for Databricks")
    
    # Create indexes for better performance
    await predefined_rules_collection.create_index("data_source")
    
    print("Database initialization for Databricks predefined rules completed successfully!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(init_database())