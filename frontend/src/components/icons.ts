import {
  Boxes,
  Building2,
  Cog,
  Factory,
  Forklift,
  Layers,
  MapPin,
  Radio,
  Server,
  Users,
  Warehouse,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  Boxes,
  Building2,
  Cog,
  Factory,
  Forklift,
  Layers,
  MapPin,
  Radio,
  Server,
  Users,
  Warehouse,
  Workflow,
  Wrench,
}

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Boxes
}

