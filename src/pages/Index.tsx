import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationFeatureFlags } from "@/hooks/useOrganizationFeatureFlags";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/layout/UserMenu";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";
import { DashboardTab } from "@/components/tabs/DashboardTab";
import { EmployeeTab } from "@/components/tabs/EmployeeTab";
import { PayrollTab } from "@/components/tabs/PayrollTab";
import { AttendanceTab } from "@/components/tabs/AttendanceTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";
import { AdminAIChatbot } from "@/components/chat/AdminAIChatbot";
import { TrialNoticeDialog } from "@/components/trial/TrialNoticeDialog";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Clock,
  FileText,
  Settings,
  ChevronDown,
  Menu,
  ClipboardList,
  BarChart3,
  FileSpreadsheet,
  UserSquare2,
  CalendarDays,
  Award,
  History,
  ListChecks,
  UserCog,
  Building2,
  Timer,
  Coins,
  Calculator,
  TreePalm,
  Zap,
  Moon,
  Network,
  UserCheck,
  Star,
} from "lucide-react";

interface SubItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  subItems?: SubItem[];
}

const FAVORITES_STORAGE_KEY = "payroll.favoriteMenus";

const menuItems: MenuItem[] = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  {
    id: "attendance",
    label: "근태 관리",
    icon: Clock,
    subItems: [
      { id: "daily", label: "일일 근태", icon: ClipboardList },
      { id: "summary", label: "근태 현황", icon: BarChart3 },
      { id: "upload", label: "엑셀 업로드", icon: FileSpreadsheet },
    ],
  },
  {
    id: "payroll",
    label: "급여 관리",
    icon: CreditCard,
    subItems: [
      { id: "regular", label: "정기 급여", icon: CreditCard },
      { id: "construction", label: "일용직 노무관리(건설업)", icon: Building2 },
    ],
  },
  {
    id: "reports",
    label: "보고서",
    icon: FileText,
    subItems: [
      { id: "salary-payment", label: "급여지급현황", icon: BarChart3 },
      { id: "monthly-trend", label: "인건비 월별 추이", icon: CreditCard },
      { id: "annual-salary", label: "직원별 연간 급여", icon: UserSquare2 },
      { id: "deduction-summary", label: "공제내역 월별 요약", icon: ListChecks },
      { id: "certificate", label: "증명서 발급", icon: Award },
      { id: "editlogs", label: "근태 수정 이력", icon: History },
    ],
  },
  {
    id: "employees",
    label: "직원 관리",
    icon: Users,
    subItems: [
      { id: "list", label: "직원 목록", icon: UserSquare2 },
      { id: "leave", label: "휴가 관리", icon: CalendarDays },
    ],
  },
  {
    id: "settings",
    label: "설정",
    icon: Settings,
    subItems: [
      { id: "work-hours", label: "근무 시간", icon: Timer },
      { id: "payroll-calc", label: "급여계산", icon: Calculator },
      { id: "payroll-items", label: "급여 항목", icon: ListChecks },
      { id: "employee-payroll", label: "직원별 급여", icon: UserCog },
      { id: "salary-work-standards", label: "급여/근무 기준", icon: UserCheck },
      { id: "allowance", label: "초과근무 시간", icon: Coins },
      { id: "night-shift", label: "야간 교대근무 설정", icon: Moon },
      { id: "leave-rules", label: "연차 규칙", icon: TreePalm },
      { id: "dept-position", label: "부서/직급 관리", icon: Network },
      { id: "automation", label: "자동화", icon: Zap },
      { id: "company-info", label: "회사 정보", icon: Building2 },
    ],
  },
];

const Index = () => {
  const navigate = useNavigate();
  const { currentOrganization, loading: organizationLoading } = useOrganization();

  const { data: trialStatus } = useQuery({
    queryKey: ["index-organization-trial-status", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await (supabase as any)
        .rpc("get_organization_trial_status", {
          _organization_id: currentOrganization.id,
        })
        .maybeSingle();

      if (error) throw error;
      return data as { is_expired: boolean } | null;
    },
    enabled: !!currentOrganization?.id,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (trialStatus?.is_expired) {
      navigate("/expired", { replace: true });
    }
  }, [trialStatus?.is_expired, navigate]);

  const { featureFlags } = useOrganizationFeatureFlags();

  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [favoriteMenus, setFavoriteMenus] = useState<string[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setFavoriteMenus(parsed);
      }
    } catch {
      setFavoriteMenus([]);
    }
  }, []);

  const getMenuKey = (menuId: string, subId?: string | null) => {
    return subId ? `${menuId}:${subId}` : menuId;
  };

  const toggleFavoriteMenu = (menuKey: string) => {
    setFavoriteMenus((prev) => {
      const next = prev.includes(menuKey)
        ? prev.filter((key) => key !== menuKey)
        : [...prev, menuKey];

      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.subItems) {
      const isExpanded = expandedMenus.includes(item.id);

      if (isExpanded) {
        setExpandedMenus((prev) => prev.filter((id) => id !== item.id));
      } else {
        setExpandedMenus((prev) => [...prev, item.id]);

        if (activeMenu !== item.id) {
          setActiveMenu(item.id);
          setActiveSubMenu(item.subItems?.[0]?.id ?? null);
        }
      }
    } else {
      setActiveMenu(item.id);
      setActiveSubMenu(null);
      setExpandedMenus([]);
      if (isMobile) setSidebarOpen(false);
    }
  };

  const handleSubMenuClick = (menuId: string, subId: string) => {
    setActiveMenu(menuId);
    setActiveSubMenu(subId);
    if (isMobile) setSidebarOpen(false);
  };

  const handleFavoriteClick = (menuId: string, subId?: string | null) => {
    setActiveMenu(menuId);
    setActiveSubMenu(subId ?? null);

    if (subId) {
      setExpandedMenus((prev) =>
        prev.includes(menuId) ? prev : [...prev, menuId],
      );
    } else {
      setExpandedMenus([]);
    }

    if (isMobile) setSidebarOpen(false);
  };

  const visibleMenuItems = menuItems
    .filter((item) => {
      if (item.id === "attendance") return featureFlags.attendance_enabled;
      if (item.id === "reports") return featureFlags.reports_enabled;
      if (item.id === "settings") return featureFlags.settings_enabled;
      return true;
    })
    .map((item) => {
      if (item.id !== "payroll" || !item.subItems) return item;

      return {
        ...item,
        subItems: item.subItems.filter((sub) => {
          if (sub.id === "regular") return featureFlags.regular_payroll_enabled;
          if (sub.id === "construction") return featureFlags.construction_daily_enabled;
          return true;
        }),
      };
    })
    .filter((item) => !item.subItems || item.subItems.length > 0);

  const favoriteMenuItems = favoriteMenus
    .map((key) => {
      const [menuId, subId] = key.split(":");
      const menu = visibleMenuItems.find((item) => item.id === menuId);
      if (!menu) return null;

      if (subId) {
        const sub = menu.subItems?.find((item) => item.id === subId);
        if (!sub) return null;

        return {
          key,
          menuId,
          subId,
          label: sub.label,
          icon: sub.icon,
        };
      }

      return {
        key,
        menuId,
        subId: null,
        label: menu.label,
        icon: menu.icon,
      };
    })
    .filter(Boolean);

  const getCurrentLabel = () => {
    const menu = visibleMenuItems.find((m) => m.id === activeMenu);
    if (!menu) return "";

    if (activeSubMenu && menu.subItems) {
      const sub = menu.subItems.find((s) => s.id === activeSubMenu);
      return sub ? `${menu.label} > ${sub.label}` : menu.label;
    }

    return menu.label;
  };

  const renderContent = () => {
    switch (activeMenu) {
      case "dashboard":
        if (organizationLoading || !currentOrganization) {
          return (
            <div className="p-6">
              <div className="h-32 rounded-lg border animate-pulse bg-muted/30" />
            </div>
          );
        }
        return <DashboardTab />;

      case "employees":
        return <EmployeeTab activeTab={activeSubMenu || "list"} />;

      case "payroll":
        return <PayrollTab activeTab={activeSubMenu || "regular"} />;

      case "attendance":
        return <AttendanceTab activeTab={activeSubMenu || "daily"} />;

      case "reports":
        return <ReportsTab section={activeSubMenu || "salary-payment"} />;

      case "settings":
        if (organizationLoading || !currentOrganization) {
          return (
            <div className="p-6">
              <div className="h-32 rounded-lg border animate-pulse bg-muted/30" />
            </div>
          );
        }
        return <SettingsTab section={activeSubMenu || "work-hours"} />;

      default:
        return <DashboardTab />;
    }
  };

  const SidebarNav = () => (
    <ScrollArea className="h-[calc(100vh-4rem)]">
      <nav className="p-3 space-y-1">
        {favoriteMenuItems.length > 0 && (
          <div className="mb-3">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
              즐겨찾기
            </div>

            <div className="space-y-0.5">
              {favoriteMenuItems.map((favorite) => {
                if (!favorite) return null;

                const FavoriteIcon = favorite.icon;
                const isFavoriteActive =
                  activeMenu === favorite.menuId &&
                  activeSubMenu === favorite.subId;

                return (
                  <div
                    key={favorite.key}
                    className={cn(
                      "flex items-center rounded-md text-sm transition-colors",
                      isFavoriteActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleFavoriteClick(favorite.menuId, favorite.subId)
                      }
                      className="flex flex-1 items-center gap-2.5 px-3 py-2 text-left"
                    >
                      <FavoriteIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{favorite.label}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFavoriteMenu(favorite.key)}
                      className="mr-2 rounded p-1 text-primary hover:bg-accent"
                      aria-label="즐겨찾기 해제"
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="my-3 border-t" />
          </div>
        )}

        {visibleMenuItems.map((item) => {
          const isActive = activeMenu === item.id;
          const isExpanded = expandedMenus.includes(item.id);
          const Icon = item.icon;
          const itemKey = getMenuKey(item.id);
          const isItemFavorite = favoriteMenus.includes(itemKey);

          return (
            <div key={item.id}>
              <div
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-colors",
                  isActive && !item.subItems
                    ? "bg-primary text-primary-foreground"
                    : isActive && item.subItems
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => handleMenuClick(item)}
                  className="flex flex-1 items-center gap-3 px-3 py-2.5 text-left"
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavoriteMenu(itemKey)}
                  className={cn(
                    "rounded p-1 transition-colors",
                    isItemFavorite
                      ? "text-primary"
                      : "text-muted-foreground hover:text-primary",
                  )}
                  aria-label={isItemFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5",
                      isItemFavorite && "fill-current",
                    )}
                  />
                </button>

                {item.subItems && (
                  <button
                    type="button"
                    onClick={() => handleMenuClick(item)}
                    className="px-3 py-2.5"
                    aria-label={isExpanded ? "메뉴 접기" : "메뉴 펼치기"}
                  >
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform duration-200",
                        isExpanded && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>

              {item.subItems && isExpanded && (
                <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-border pl-3">
                  {item.subItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive =
                      activeMenu === item.id && activeSubMenu === sub.id;
                    const subKey = getMenuKey(item.id, sub.id);
                    const isSubFavorite = favoriteMenus.includes(subKey);

                    return (
                      <div
                        key={sub.id}
                        className={cn(
                          "flex items-center rounded-md text-sm transition-colors",
                          isSubActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSubMenuClick(item.id, sub.id)}
                          className="flex flex-1 items-center gap-2.5 px-3 py-2 text-left"
                        >
                          <SubIcon className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="flex-1 truncate">{sub.label}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleFavoriteMenu(subKey)}
                          className={cn(
                            "mr-2 rounded p-1 transition-colors",
                            isSubFavorite
                              ? "text-primary"
                              : "text-muted-foreground hover:text-primary",
                          )}
                          aria-label={
                            isSubFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"
                          }
                        >
                          <Star
                            className={cn(
                              "w-3.5 h-3.5",
                              isSubFavorite && "fill-current",
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </ScrollArea>
  );

  return (
    <div className="min-h-screen bg-background flex w-full">
      {!isMobile && (
        <aside className="w-72 border-r bg-card flex-shrink-0 h-screen sticky top-0 flex flex-col">
          <div className="p-4 border-b">
            <h1 className="text-lg font-bold text-foreground">급여·근태 관리</h1>
            <p className="text-xs text-muted-foreground mt-0.5">시스템</p>
          </div>
          <SidebarNav />
        </aside>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <div className="p-4 border-b">
                    <h1 className="text-lg font-bold text-foreground">급여·근태 관리</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">시스템</p>
                  </div>
                  <SidebarNav />
                </SheetContent>
              </Sheet>
            )}

            <div>
              <h2 className="text-base font-semibold text-foreground">
                {getCurrentLabel()}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <OrganizationSwitcher />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {renderContent()}
        </main>
      </div>

      <TrialNoticeDialog />
      <AdminAIChatbot />
    </div>
  );
};

export default Index;