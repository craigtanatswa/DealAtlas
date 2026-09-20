import {
  BriefcaseIcon,
  Building2Icon,
  FactoryIcon,
  GraduationCapIcon,
  HammerIcon,
  HeartPulseIcon,
  MegaphoneIcon,
  MonitorIcon,
  PackageIcon,
  TruckIcon,
  UtensilsCrossedIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  technology: MonitorIcon,
  "professional-services": BriefcaseIcon,
  "construction-infrastructure": HammerIcon,
  "facilities-property": Building2Icon,
  healthcare: HeartPulseIcon,
  education: GraduationCapIcon,
  "transport-logistics": TruckIcon,
  "manufacturing-industrial": FactoryIcon,
  "marketing-creative": MegaphoneIcon,
  "food-catering": UtensilsCrossedIcon,
  "energy-utilities": ZapIcon,
  "office-business-supplies": PackageIcon,
};

export function categoryIcon(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? PackageIcon;
}
