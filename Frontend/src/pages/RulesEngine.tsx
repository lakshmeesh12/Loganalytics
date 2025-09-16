import { useState } from "react";
import { Plus, Search, TestTube, Play, Pause, Edit, Trash2, Download, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

const dataSources = [
  { id: "snowflake", name: "Snowflake", icon: "❄️" },
  { id: "eks", name: "AWS EKS", icon: "☁️" },
  { id: "windows", name: "Windows", icon: "🪟" },
  { id: "linux", name: "Linux", icon: "🐧" },
  { id: "macos", name: "macOS", icon: "🍎" },
];

const predefinedRules = {
  snowflake: [
    { name: "Query Failure Alert", condition: "Query fails 3 times in 10 minutes", action: "Trigger ErrorAnalyzer" },
    { name: "Long Running Query", condition: "Query duration > 5 minutes", action: "Trigger Monitor & Notify" },
    { name: "Connection Timeout", condition: "Connection timeout > 2 in 5 minutes", action: "Trigger FixerAgent" },
  ],
  eks: [
    { name: "Pod Crash Alert", condition: "Pod crash count > 2 in 5 minutes", action: "Trigger ErrorAnalyzer" },
    { name: "Node Not Ready", condition: "Node status = NotReady for > 2 minutes", action: "Trigger FixerAgent" },
    { name: "High CPU Usage", condition: "CPU usage > 90% for 5 minutes", action: "Trigger Monitor & Scale" },
  ],
  windows: [
    { name: "Event ID 7003 Alert", condition: "Event ID = 7003 occurs", action: "Trigger FixerAgent" },
    { name: "Service Stop Alert", condition: "Critical service stops unexpectedly", action: "Trigger ErrorAnalyzer & Fix" },
    { name: "Disk Space Low", condition: "Disk space < 10%", action: "Trigger Monitor & Cleanup" },
  ],
  linux: [
    { name: "Out of Memory Alert", condition: "Syslog contains 'Out of memory'", action: "Trigger FixerAgent" },
    { name: "High Load Average", condition: "Load average > 5 for 3 minutes", action: "Trigger Monitor & Analyze" },
    { name: "Failed Login Attempts", condition: "Failed login > 5 in 1 minute", action: "Trigger Security Alert" },
  ],
  macos: [
    { name: "Disk Full Alert", condition: "System.log has 'disk full'", action: "Trigger FixerAgent" },
    { name: "Kernel Panic", condition: "Kernel panic detected", action: "Trigger ErrorAnalyzer" },
    { name: "Application Crash", condition: "App crash > 3 in 10 minutes", action: "Trigger Monitor & Fix" },
  ],
};

const mockRules = [
  {
    id: 1,
    name: "Snowflake Query Timeout",
    type: "Predefined",
    dataSource: "snowflake",
    condition: "Query fails 3 times in 10 minutes",
    action: "Trigger ErrorAnalyzer",
    status: "Active",
    lastTriggered: "2025-01-28 10:30:00",
    priority: "High"
  },
  {
    id: 2,
    name: "EKS Pod Failure Custom",
    type: "Custom",
    dataSource: "eks",
    condition: "Pod restart > 5 in 15 minutes",
    action: "Trigger FixerAgent",
    status: "Active",
    lastTriggered: "2025-01-28 09:15:00",
    priority: "Medium"
  },
  {
    id: 3,
    name: "Windows Service Monitor",
    type: "Predefined",
    dataSource: "windows",
    condition: "Event ID = 7003",
    action: "Trigger FixerAgent",
    status: "Inactive",
    lastTriggered: "Never",
    priority: "High"
  },
];

export function RulesEngine() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showPredefinedDialog, setShowPredefinedDialog] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [selectedDataSource, setSelectedDataSource] = useState("");
  const [nlpInput, setNlpInput] = useState("");
  const [parsedRule, setParsedRule] = useState(null);

  const filteredRules = mockRules.filter(rule => {
    const matchesTab = activeTab === "all" || rule.dataSource === activeTab;
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rule.condition.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleNLPParse = () => {
    // Simulate NLP parsing
    const mockParsed = {
      dataSource: "snowflake",
      condition: "query_duration > 30s AND count > 5",
      action: "Trigger ErrorAnalyzer",
      priority: "Medium",
      notification: "Email"
    };
    setParsedRule(mockParsed);
  };

  const getStatusBadge = (status: string) => (
    <Badge variant={status === "Active" ? "default" : "secondary"}>
      {status}
    </Badge>
  );

  const getPriorityBadge = (priority: string) => (
    <Badge variant={priority === "High" ? "destructive" : priority === "Medium" ? "default" : "secondary"}>
      {priority}
    </Badge>
  );

  return (
    <AppLayout title="Rules Engine" breadcrumbs={["Rules Engine"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Rules Engine</h1>
            <p className="text-muted-foreground">Manage alert rules for intelligent log monitoring and automated remediation</p>
          </div>
          
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Predefined Rule
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {dataSources.map((source) => (
                  <DropdownMenuItem key={source.id} onClick={() => {
                    setSelectedDataSource(source.id);
                    setShowPredefinedDialog(true);
                  }}>
                    <span className="mr-2">{source.icon}</span>
                    {source.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button variant="outline" onClick={() => setShowCustomDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Custom Rule (NLP)
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  <Download className="h-4 w-4 mr-2" />
                  Export Rules
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Rules
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search rules by name or condition..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Source Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">All Sources</TabsTrigger>
            {dataSources.map((source) => (
              <TabsTrigger key={source.id} value={source.id} className="gap-2">
                <span>{source.icon}</span>
                <span className="hidden sm:inline">{source.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Rules
                  <Badge variant="outline">{filteredRules.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Manage and monitor your alert rules for automated log analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Data Source</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Triggered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant={rule.type === "Predefined" ? "default" : "outline"}>
                            {rule.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{dataSources.find(ds => ds.id === rule.dataSource)?.icon}</span>
                            {dataSources.find(ds => ds.id === rule.dataSource)?.name}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={rule.condition}>
                          {rule.condition}
                        </TableCell>
                        <TableCell>{rule.action}</TableCell>
                        <TableCell>{getPriorityBadge(rule.priority)}</TableCell>
                        <TableCell>{getStatusBadge(rule.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rule.lastTriggered}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost">
                              <TestTube className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost">
                              {rule.status === "Active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Predefined Rule Dialog */}
        <Dialog open={showPredefinedDialog} onOpenChange={setShowPredefinedDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Predefined Rule</DialogTitle>
              <DialogDescription>
                Choose from predefined rules for {dataSources.find(ds => ds.id === selectedDataSource)?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {selectedDataSource && predefinedRules[selectedDataSource]?.map((rule, index) => (
                <Card key={index} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="font-medium">{rule.name}</h4>
                        <Button size="sm">Select</Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <strong>Condition:</strong> {rule.condition}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Action:</strong> {rule.action}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Custom Rule NLP Dialog */}
        <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Create Custom Rule with Natural Language</DialogTitle>
              <DialogDescription>
                Describe your rule in plain English, and our AI will convert it to a structured rule
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="nlp-input">Describe your rule</Label>
                <Textarea
                  id="nlp-input"
                  placeholder="Example: Alert me if Snowflake query takes longer than 30 seconds 5 times in an hour"
                  value={nlpInput}
                  onChange={(e) => setNlpInput(e.target.value)}
                  rows={3}
                />
                <Button onClick={handleNLPParse} disabled={!nlpInput.trim()}>
                  Parse Rule
                </Button>
              </div>

              {parsedRule && (
                <Alert>
                  <AlertDescription>
                    <strong>Parsed Rule:</strong> Data Source: {parsedRule.dataSource}, 
                    Condition: {parsedRule.condition}, 
                    Action: {parsedRule.action}
                  </AlertDescription>
                </Alert>
              )}

              {parsedRule && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rule Name</Label>
                    <Input placeholder="Enter rule name" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data Source</Label>
                    <Select value={parsedRule.dataSource}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dataSources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            <span className="mr-2">{source.icon}</span>
                            {source.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Input value={parsedRule.condition} />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Action</Label>
                    <Select value={parsedRule.action}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="notify">Notify Only</SelectItem>
                        <SelectItem value="analyze">Trigger ErrorAnalyzer</SelectItem>
                        <SelectItem value="fix">Trigger FixerAgent</SelectItem>
                        <SelectItem value="analyze-fix">Analyze & Fix</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={parsedRule.priority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Notification</Label>
                    <Select value={parsedRule.notification}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="Slack">Slack</SelectItem>
                        <SelectItem value="Both">Email & Slack</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="col-span-2 flex items-center space-x-2">
                    <Switch id="real-time" />
                    <Label htmlFor="real-time">Real-time evaluation</Label>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCustomDialog(false)}>
                Cancel
              </Button>
              <Button disabled={!parsedRule}>
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}