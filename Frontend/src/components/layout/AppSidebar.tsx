import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Settings,
  Database,
  Terminal,
  Shield,
  Home,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Agent Actions", url: "/agents", icon: Activity },
  { title: "Live Console", url: "/console", icon: Terminal },
  { title: "Data Sources", url: "/sources", icon: Database },
  { title: "Configurations", url: "/configurations", icon: Settings },
  { title: "Rules Engine", url: "/rules", icon: Settings },
  { title: "System Health", url: "/health", icon: BarChart3 },
];

const agentItems = [
  { title: "Error Analyzer", url: "/agents/error-analyzer", icon: Shield },
  { title: "Fixer Agent", url: "/agents/fixer", icon: Activity },
  { title: "Monitor Agent", url: "/agents/monitor", icon: BarChart3 },
  { title: "Log Forwarder", url: "/agents/forwarder", icon: Database },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === "/") return currentPath === "/";
    return currentPath.startsWith(path);
  };

  const getNavClasses = (active: boolean) =>
    active 
      ? "bg-primary text-primary-foreground font-medium" 
      : "text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <Sidebar className="border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          {state !== "collapsed" && (
            <h2 className="text-lg font-semibold">LogAnalytics</h2>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-muted"
        >
          {state === "collapsed" ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      className={getNavClasses(isActive(item.url))}
                    >
                      <item.icon className="h-4 w-4" />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Agent Management */}
        {state !== "collapsed" && (
          <SidebarGroup>
            <SidebarGroupLabel>Agents</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {agentItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url}
                        className={getNavClasses(isActive(item.url))}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}