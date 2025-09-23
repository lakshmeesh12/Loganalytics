import { useState, useEffect } from "react";
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
import { rulesApi, Rule, PredefinedRule, CreateRuleRequest, NLPParseResponse } from "@/api.ts";

const dataSources = [
  { 
    id: "snowflake", 
    name: "Snowflake", 
    icon: <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
  },
  { 
    id: "eks", 
    name: "AWS EKS", 
    icon: <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
  },
  { 
    id: "windows", 
    name: "Windows", 
    icon: <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
  },
  { 
    id: "linux", 
    name: "Linux", 
    icon: <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
  },
  { 
    id: "databricks", 
    name: "Databricks", 
    icon: <img src="https://i.pinimg.com/736x/65/1d/d6/651dd6bdd503bd0aaba588b9e6439459.jpg" alt="Databricks" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
  },
];

export function RulesEngine() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showPredefinedDialog, setShowPredefinedDialog] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedDataSource, setSelectedDataSource] = useState("");
  const [nlpInput, setNlpInput] = useState("");
  const [parsedRule, setParsedRule] = useState<NLPParseResponse | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [predefinedRules, setPredefinedRules] = useState<PredefinedRule[]>([]);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [newRuleName, setNewRuleName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch rules on mount and when filters change
  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoading(true);
        const filters = {
          data_source: activeTab !== "all" ? activeTab : undefined,
          search: searchTerm || undefined,
        };
        const fetchedRules = await rulesApi.getRules(filters);
        setRules(fetchedRules);
      } catch (err) {
        setError("Failed to fetch rules");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, [activeTab, searchTerm]);

  // Fetch predefined rules when dialog opens
  useEffect(() => {
    if (showPredefinedDialog && selectedDataSource) {
      const fetchPredefinedRules = async () => {
        try {
          setLoading(true);
          const fetchedPredefinedRules = await rulesApi.getPredefinedRules(selectedDataSource);
          setPredefinedRules(fetchedPredefinedRules);
        } catch (err) {
          setError("Failed to fetch predefined rules");
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchPredefinedRules();
    }
  }, [showPredefinedDialog, selectedDataSource]);

  const handleNLPParse = async () => {
    try {
      setLoading(true);
      const response = await rulesApi.parseNLPRule(nlpInput);
      setParsedRule(response);
    } catch (err) {
      setError("Failed to parse NLP rule");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async () => {
    if (!parsedRule) return;
    try {
      setLoading(true);
      const ruleData: CreateRuleRequest = {
        name: newRuleName || `Custom Rule ${new Date().toISOString()}`,
        type: "Custom",
        data_source: parsedRule.data_source,
        condition: parsedRule.condition,
        action: parsedRule.action,
        priority: parsedRule.priority,
        notification: parsedRule.notification,
        real_time: true,
      };
      const newRule = await rulesApi.createRule(ruleData);
      setRules([...rules, newRule]);
      setShowCustomDialog(false);
      setParsedRule(null);
      setNlpInput("");
      setNewRuleName("");
    } catch (err) {
      setError("Failed to create rule");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRule = async () => {
    if (!editingRule) return;
    try {
      setLoading(true);
      const updates = {
        name: newRuleName || editingRule.name,
        condition: editingRule.condition,
        action: editingRule.action,
        priority: editingRule.priority,
        notification: editingRule.notification,
        real_time: editingRule.real_time,
      };
      const updatedRule = await rulesApi.updateRule(editingRule.id, updates);
      setRules(rules.map(r => (r.id === updatedRule.id ? updatedRule : r)));
      setShowEditDialog(false);
      setEditingRule(null);
      setNewRuleName("");
    } catch (err) {
      setError("Failed to update rule");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (rule: Rule) => {
    try {
      setLoading(true);
      const updatedRule = await rulesApi.toggleRuleStatus(rule.id);
      setRules(rules.map(r => (r.id === updatedRule.id ? updatedRule : r)));
    } catch (err) {
      setError("Failed to toggle rule status");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      setLoading(true);
      await rulesApi.deleteRule(ruleId);
      setRules(rules.filter(r => r.id !== ruleId));
    } catch (err) {
      setError("Failed to delete rule");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleActivatePredefinedRule = async (predefinedRuleId: string) => {
    try {
      setLoading(true);
      const newRule = await rulesApi.activatePredefinedRule(predefinedRuleId);
      setRules([...rules, newRule]);
      setShowPredefinedDialog(false);
    } catch (err) {
      setError("Failed to activate predefined rule");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => (
    <Badge 
      variant={status === "Active" ? "default" : "secondary"} 
      className={`text-xs px-1.5 py-0.5 ${
        status === "Active" 
          ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm hover:from-green-600 hover:to-green-700" 
          : "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </Badge>
  );

  const getPriorityBadge = (priority: string) => (
    <Badge 
      variant={priority === "High" ? "destructive" : priority === "Medium" ? "default" : "secondary"} 
      className="text-xs px-1.5 py-0.5"
    >
      {priority}
    </Badge>
  );

  return (
    <AppLayout title="Rules Engine" breadcrumbs={["Rules Engine"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-lg font-medium gradient-text">Rules Engine</h1>
            <p className="text-sm text-muted-foreground">Manage alert rules for intelligent log monitoring and automated remediation</p>
          </div>
          
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1 text-xs px-3 py-1.5 h-8" disabled={loading}>
                  <Plus className="h-3 w-3" />
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
            
            <Button variant="outline" onClick={() => setShowCustomDialog(true)} className="gap-1 text-xs px-3 py-1.5 h-8" disabled={loading}>
              <Plus className="h-3 w-3" />
              Add Custom Rule (NLP)
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={loading}>
                  <Download className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem className="text-xs">
                  <Download className="h-3 w-3 mr-2" />
                  Export Rules
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs">
                  <Upload className="h-3 w-3 mr-2" />
                  Import Rules
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search rules by name or condition..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-sm h-9"
                  disabled={loading}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Source Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 text-xs h-8">
            <TabsTrigger value="all" className="text-xs px-2 py-1">All Sources</TabsTrigger>
            {dataSources.map((source) => (
              <TabsTrigger key={source.id} value={source.id} className="gap-1 text-xs px-2 py-1">
                {source.icon}
                <span className="hidden sm:inline">{source.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  Rules
                  <Badge variant="outline" className="text-xs">{rules.length}</Badge>
                </CardTitle>
                <CardDescription className="text-sm">
                  Manage and monitor your alert rules for automated log analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="text-sm">
                      <TableHead className="text-xs font-medium">Rule Name</TableHead>
                      <TableHead className="text-xs font-medium">Type</TableHead>
                      <TableHead className="text-xs font-medium">Data Source</TableHead>
                      <TableHead className="text-xs font-medium">Condition</TableHead>
                      <TableHead className="text-xs font-medium">Priority</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Last Triggered</TableHead>
                      <TableHead className="text-xs font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id} className="text-sm">
                        <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant={rule.type === "Predefined" ? "default" : "outline"} className="text-xs px-1.5 py-0.5">
                            {rule.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {dataSources.find(ds => ds.id === rule.data_source)?.icon}
                            <span className="text-sm">{dataSources.find(ds => ds.id === rule.data_source)?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm" title={rule.condition}>
                          {rule.condition}
                        </TableCell>
                        <TableCell className="text-sm">{getPriorityBadge(rule.priority)}</TableCell>
                        <TableCell className="text-sm">{getStatusBadge(rule.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {rule.last_triggered || "Never"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={loading}>
                              <TestTube className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 w-6 p-0" 
                              disabled={loading}
                              onClick={() => {
                                setEditingRule(rule);
                                setNewRuleName(rule.name);
                                setShowEditDialog(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 w-6 p-0" 
                              disabled={loading}
                              onClick={() => handleToggleStatus(rule)}
                            >
                              {rule.status === "Active" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-destructive h-6 w-6 p-0" 
                              disabled={loading}
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <Trash2 className="h-3 w-3" />
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
          <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-lg font-medium">Add Predefined Rule</DialogTitle>
              <DialogDescription className="text-sm">
                Choose from predefined rules for {dataSources.find(ds => ds.id === selectedDataSource)?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="grid gap-4 py-4">
                {predefinedRules.map((rule) => (
                  <Card key={rule.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col space-y-3">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium text-sm">{rule.name}</h4>
                          <Button 
                            size="sm" 
                            className="text-xs h-7 px-3" 
                            disabled={loading}
                            onClick={() => handleActivatePredefinedRule(rule.id)}
                          >
                            Select
                          </Button>
                        </div>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>
                            <strong>Condition:</strong> {rule.condition}
                          </p>
                          <p>
                            <strong>Action:</strong> {rule.action}
                          </p>
                          {rule.description && (
                            <p>
                              <strong>Description:</strong> {rule.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <DialogFooter className="shrink-0">
              <Button 
                variant="outline" 
                onClick={() => setShowPredefinedDialog(false)} 
                className="text-xs h-7 px-3"
                disabled={loading}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Custom Rule NLP Dialog */}
        <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-medium">Create Custom Rule with Natural Language</DialogTitle>
              <DialogDescription className="text-sm">
                Describe your rule in plain English, and our AI will convert it to a structured rule
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="nlp-input" className="text-sm">Describe your rule</Label>
                <Textarea
                  id="nlp-input"
                  placeholder="Example: Alert me if Snowflake query takes longer than 30 seconds 5 times in an hour"
                  value={nlpInput}
                  onChange={(e) => setNlpInput(e.target.value)}
                  rows={3}
                  className="text-sm"
                  disabled={loading}
                />
                <Button onClick={handleNLPParse} disabled={!nlpInput.trim() || loading} className="text-xs h-7 px-3">
                  Parse Rule
                </Button>
              </div>

              {parsedRule && (
                <Alert>
                  <AlertDescription>
                    <strong>Parsed Rule:</strong> Data Source: {dataSources.find(ds => ds.id === parsedRule.data_source)?.name}, 
                    Condition: {parsedRule.condition}, 
                    Action: {parsedRule.action}
                  </AlertDescription>
                </Alert>
              )}

              {parsedRule && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rule Name</Label>
                    <Input 
                      placeholder="Enter rule name" 
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data Source</Label>
                    <Select value={parsedRule.data_source} disabled>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dataSources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            <div className="flex items-center gap-2">
                              {source.icon}
                              {source.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Input value={parsedRule.condition} disabled />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Action</Label>
                    <Select value={parsedRule.action} disabled>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Notify Only">Notify Only</SelectItem>
                        <SelectItem value="Trigger ErrorAnalyzer">Trigger ErrorAnalyzer</SelectItem>
                        <SelectItem value="Trigger FixerAgent">Trigger FixerAgent</SelectItem>
                        <SelectItem value="Analyze & Fix">Analyze & Fix</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={parsedRule.priority} disabled>
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
                    <Select value={parsedRule.notification} disabled>
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
                    <Switch id="real-time" checked disabled />
                    <Label htmlFor="real-time">Real-time evaluation</Label>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCustomDialog(false)} className="text-xs h-7 px-3" disabled={loading}>
                Cancel
              </Button>
              <Button disabled={!parsedRule || loading} className="text-xs h-7 px-3" onClick={handleCreateRule}>
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Rule Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-medium">Edit Rule</DialogTitle>
              <DialogDescription className="text-sm">
                Modify the rule name for {editingRule?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input 
                  placeholder="Enter rule name" 
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)} className="text-xs h-7 px-3" disabled={loading}>
                Cancel
              </Button>
              <Button disabled={!newRuleName || loading} className="text-xs h-7 px-3" onClick={handleEditRule}>
                Update Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}