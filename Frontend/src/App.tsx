import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AgentActions from "./pages/AgentActions";
import LiveConsole from "./pages/LiveConsole";
import Configurations from "./pages/Configurations";
import DataSources from "./pages/DataSources";
import RealTimeMonitoring from "./pages/RealTimeMonitoring";
import NotFound from "./pages/NotFound";
import { RulesEngine } from "./pages/RulesEngine";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/agents" element={<AgentActions />} />
          <Route path="/console" element={<LiveConsole />} />
          <Route path="/configurations" element={<Configurations />} />
          <Route path="/sources" element={<DataSources />} />
          <Route path="/monitoring" element={<RealTimeMonitoring />} />
          <Route path="/rules" element={<RulesEngine />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;