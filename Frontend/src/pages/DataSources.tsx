import { useState, useMemo } from 'react';
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Database, Workflow, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import aiAgentIcon from "@/assets/ai-agent-icon.jpg";

// --- React Flow Imports ---
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  NodeProps,
  Edge,
  Node,
} from 'reactflow';
import 'reactflow/dist/style.css'; // Essential React Flow styles

// --- Data Interfaces and Mock Data ---
interface DataSource {
  id: string;
  name: string;
  type: 'snowflake' | 'eks' | 'windows' | 'linux' | 'macos' | 'databricks';
  status: 'connected' | 'disconnected' | 'error';
  description: string;
}

const mockDataSources: DataSource[] = [
  { id: '1', name: 'Production Snowflake', type: 'snowflake', status: 'connected', description: 'Main data warehouse for analytics queries' },
  { id: '2', name: 'EKS Main Cluster', type: 'eks', status: 'connected', description: 'Production Kubernetes cluster logs' },
  { id: '3', name: 'Windows Servers', type: 'windows', status: 'connected', description: 'Windows Event Logs monitoring' },
  { id: '5', name: 'Databricks Workspace', type: 'databricks', status: 'connected', description: 'Cloud data platform for analytics and ML workloads' }
];

const dataSourceTypes = [
    { type: 'snowflake', name: 'Snowflake', icon: <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake"/>, description: 'Data warehouse query logs', category: 'Database' },
    { type: 'eks', name: 'AWS EKS', icon: <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS"/>, description: 'Kubernetes cluster logs', category: 'Cloud' },
    { type: 'windows', name: 'Windows', icon: <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows"/>, description: 'Windows Event Logs', category: 'System' },
    { type: 'linux', name: 'Linux', icon: <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux"/>, description: 'Linux system logs', category: 'System' },
    { type: 'macos', name: 'macOS', icon: <img src="https://www.pinclipart.com/picdir/big/236-2364339_macos-icon-clipart.png" alt="macOS"/>, description: 'macOS system logs', category: 'System' },
    { type: 'databricks', name: 'Databricks', icon: <img src="https://i.pinimg.com/736x/65/1d/d6/651dd6bdd503bd0aaba588b9e6439459.jpg" alt="Databricks"/>, description: 'Cloud data platform', category: 'Cloud' }
];

// --- Styles for React Flow (Embedded in a component) ---
const ReactFlowStyles = () => (
  <style>{`
    .react-flow__edge-path {
      stroke: url(#edge-gradient);
      stroke-width: 2;
    }
  `}</style>
);

// --- React Flow Custom Components ---

interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
  icon: JSX.Element;
}

// Custom Node for the Central AI Agent
const AiAgentNode = () => (
  <div className="relative flex flex-col items-center gap-2 p-4 bg-background rounded-full shadow-xl border-2 border-primary w-[140px] h-[140px] justify-center">
    <img src={aiAgentIcon} alt="AI Agent" className="w-12 h-12 rounded-full" />
    <div className="text-center">
      <p className="font-bold text-sm text-primary">AI Agent</p>
      <p className="text-[10px] text-muted-foreground">Monitoring</p>
    </div>
    {/* FIX: This handle now covers the entire node, making connections clean from any angle. */}
    <Handle 
      type="target" 
      position={Position.Top} 
      className="!w-full !h-full !rounded-full !bg-transparent !border-0"
    />
  </div>
);

// Custom Node for each Data Source
const DataSourceNode = ({ data }: NodeProps<{ label: string; icon: JSX.Element }>) => (
  <div className="flex flex-col items-center gap-1.5 p-2 bg-background rounded-lg shadow-md border hover:border-primary transition-colors w-24">
    {/* FIX: This handle also covers the entire node for optimal connection points. */}
    <Handle 
      type="source" 
      position={Position.Top} 
      className="!w-full !h-full !rounded-lg !bg-transparent !border-0"
    />
    {data.icon}
    <p className="font-semibold text-center truncate w-full text-xs" title={data.label}>{data.label}</p>
    <Badge variant="default" className="bg-green-500 text-white text-[10px] px-1.5 py-0.5">
      <CheckCircle className="w-2 h-2 mr-1" />
      Connected
    </Badge>
  </div>
);

// Gradient definition for the edges
const EdgeGradient = () => (
  <svg width="0" height="0">
    <defs>
      <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style={{ stopColor: '#a855f7', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#3b82f6', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
  </svg>
);

// --- Interactive Map Component ---
function DataSourceMap({ dataSources }: { dataSources: DataSourceInfo[] }) {
  const nodeTypes = useMemo(() => ({ aiAgent: AiAgentNode, dataSource: DataSourceNode }), []);

  const { nodes, edges } = useMemo(() => {
    const initialNodes: Node[] = [{ id: 'ai-agent', type: 'aiAgent', position: { x: 0, y: 0 }, selectable: false, draggable: false }];
    const initialEdges: Edge[] = [];
    const radius = 280; // Increased radius for better spacing
    const count = dataSources.length;

    dataSources.forEach((source, index) => {
      const angle = (index / count) * (2 * Math.PI);
      initialNodes.push({
        id: source.id,
        type: 'dataSource',
        position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
        data: { label: source.name, icon: source.icon },
      });
      initialEdges.push({
        id: `edge-${source.id}-to-agent`,
        source: source.id,
        target: 'ai-agent',
        animated: true,
      });
    });
    return { nodes: initialNodes, edges: initialEdges };
  }, [dataSources]);

  return (
    <div style={{ height: '500px', width: '100%' }} className="rounded-lg overflow-hidden border">
      <ReactFlowStyles />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-muted/30"
        nodesDraggable={false} // Disable node dragging for a clean, static view
        nodesConnectable={false}
      >
        <Background />
        <Controls showInteractive={false} /> {/* Hide zoom/pan controls if not needed */}
        <EdgeGradient />
      </ReactFlow>
    </div>
  );
}

// --- Main Page Component ---
export default function DataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>(mockDataSources);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [sourceName, setSourceName] = useState('');
  const { toast } = useToast();

  const getDataSourceIcon = (type: string, size: 'small' | 'large' = 'large') => {
    const source = dataSourceTypes.find(s => s.type === type);
    const className = size === 'large' 
      ? "w-10 h-10 object-contain" 
      : "w-8 h-8 object-contain";
    
    if (source?.icon) {
      return { ...source.icon, props: { ...source.icon.props, className } };
    }
    return <Database className={className} />;
  };

  const addDataSource = () => {
    if (!selectedType || !sourceName) {
      toast({
        title: "Validation Error 🚨",
        description: "Please select a data source type and provide a name.",
        variant: "destructive",
      });
      return;
    }

    const sourceTypeInfo = dataSourceTypes.find(s => s.type === selectedType);
    const newSource: DataSource = {
      id: `ds-${Date.now()}`,
      name: sourceName,
      type: selectedType as DataSource['type'],
      status: 'connected', // Set as connected to appear in the map
      description: sourceTypeInfo?.description || 'Newly added data source',
    };

    setDataSources(prev => [...prev, newSource]);
    setIsAddDialogOpen(false); // Close dialog on success
    setSelectedType(''); // Reset form
    setSourceName(''); // Reset form

    toast({
      title: "Success! ✨",
      description: `${sourceName} has been connected and is now being monitored.`,
    });
  };
  
  const activeConnections = dataSources
    .filter(s => s.status === 'connected')
    .map(s => ({ ...s, icon: getDataSourceIcon(s.type, 'large') }));

  return (
    <AppLayout title="Data Sources" breadcrumbs={["Data Sources"]}>
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <div className="space-y-6">
          {/* Header and Add Data Source Button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Agent Data Sources</h2>
              <p className="text-sm text-muted-foreground">Configure and visualize data sources for your AI monitoring agent.</p>
            </div>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Add Data Source</Button>
            </DialogTrigger>
          </div>
          
          {/* Connected Data Sources Visualization */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Workflow className="w-5 h-5" />Connected Data Sources</h3>
            <Card>
              <CardContent className="p-2 relative">
                {/* FIX: Added a professionally placed Plus icon button */}
                <DialogTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted"
                        aria-label="Add new data source"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DataSourceMap dataSources={activeConnections} />
              </CardContent>
            </Card>
          </div>
          
          {/* Available Data Source Types */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Available Data Sources</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dataSourceTypes.map((sourceType) => (
                  <Card key={sourceType.type} className="hover:shadow-lg transition-shadow flex flex-col">
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                      <div>{getDataSourceIcon(sourceType.type, 'small')}</div>
                      <div className='flex-1'>
                        <CardTitle className="text-base">{sourceType.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px] mt-1">{sourceType.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-xs text-muted-foreground">{sourceType.description}</p>
                    </CardContent>
                    <DialogTrigger asChild>
                      <Button variant="ghost" className="m-4 mt-0" onClick={() => setSelectedType(sourceType.type)}>
                        <Plus className="w-4 h-4 mr-2" />Connect
                      </Button>
                    </DialogTrigger>
                  </Card>
                ))}
            </div>
          </div>
        </div>
        
        {/* FIX: Full Dialog Content for adding a new source */}
        <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>Add New Data Source</DialogTitle>
                <DialogDescription>
                    Select a type and give your new data source a unique name.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="type" className="text-right">Type</Label>
                    <Select onValueChange={setSelectedType} value={selectedType}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select a source type" />
                        </SelectTrigger>
                        <SelectContent>
                            {dataSourceTypes.map((source) => (
                                <SelectItem key={source.type} value={source.type}>
                                    <div className="flex items-center gap-2">
                                        {getDataSourceIcon(source.type, 'small')}
                                        <span>{source.name}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Source Name</Label>
                    <Input
                        id="name"
                        value={sourceName}
                        onChange={(e) => setSourceName(e.target.value)}
                        className="col-span-3"
                        placeholder="e.g., Production DB"
                    />
                </div>
            </div>
            <DialogFooter>
                <Button type="submit" onClick={addDataSource}>Connect Source</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}