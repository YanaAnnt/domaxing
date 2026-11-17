import {
  Briefcase, GraduationCap, Home, Dumbbell, Heart, Sparkles, Star, Book, Code, Palette,
  Plane, ShoppingBag, Wallet, Music, Camera, Coffee, Leaf, Users, Lightbulb, Target,
  Folder, Rocket, Gamepad2, Baby, PawPrint, Car, Utensils, Brain, Calendar, Flag,
  type LucideIcon,
} from "lucide-react";
import type { Priority } from "./types";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, graduation: GraduationCap, home: Home, dumbbell: Dumbbell, heart: Heart,
  sparkles: Sparkles, star: Star, book: Book, code: Code, palette: Palette, plane: Plane,
  shopping: ShoppingBag, wallet: Wallet, music: Music, camera: Camera, coffee: Coffee, leaf: Leaf,
  users: Users, lightbulb: Lightbulb, target: Target, folder: Folder, rocket: Rocket,
  gamepad: Gamepad2, baby: Baby, paw: PawPrint, car: Car, utensils: Utensils, brain: Brain,
  calendar: Calendar, flag: Flag,
};

/** Category colors: [light, dark] tuned for contrast in both themes. */
export const CATEGORY_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  blue: { light: "#2f6fea", dark: "#5b93ff", label: "Blue" },
  indigo: { light: "#5b5bd6", dark: "#8b8bff", label: "Indigo" },
  violet: { light: "#8e4ec6", dark: "#b88cf0", label: "Violet" },
  pink: { light: "#d6409f", dark: "#f17cc4", label: "Pink" },
  red: { light: "#e5484d", dark: "#ff7a7e", label: "Red" },
  orange: { light: "#e5732b", dark: "#ff9d5c", label: "Orange" },
  amber: { light: "#d69a00", dark: "#ffc53d", label: "Amber" },
  green: { light: "#2b9a66", dark: "#4cc38a", label: "Green" },
  teal: { light: "#12a594", dark: "#3ed3bf", label: "Teal" },
  cyan: { light: "#0797b9", dark: "#4ccce6", label: "Cyan" },
  slate: { light: "#697586", dark: "#9aa4b2", label: "Slate" },
  brown: { light: "#a07553", dark: "#d0a37e", label: "Brown" },
};

export const ACCENTS: Record<string, { light: string; dark: string; label: string }> = {
  blue: { light: "#4f6bed", dark: "#7d93ff", label: "Periwinkle" },
  indigo: CATEGORY_COLORS.indigo,
  violet: CATEGORY_COLORS.violet,
  pink: CATEGORY_COLORS.pink,
  orange: CATEGORY_COLORS.orange,
  green: CATEGORY_COLORS.green,
  teal: CATEGORY_COLORS.teal,
  slate: { light: "#3a3f47", dark: "#d4d8de", label: "Graphite" },
};

export const PRIORITIES: { value: Priority; label: string; short: string; color: string }[] = [
  { value: 0, label: "No priority", short: "None", color: "var(--c-faint)" },
  { value: 1, label: "Low", short: "Low", color: "var(--c-p1)" },
  { value: 2, label: "Medium", short: "Med", color: "var(--c-p2)" },
  { value: 3, label: "High", short: "High", color: "var(--c-p3)" },
  { value: 4, label: "Urgent", short: "Urgent", color: "var(--c-p4)" },
];

export const priorityColor = (p: Priority) => PRIORITIES[p].color;
