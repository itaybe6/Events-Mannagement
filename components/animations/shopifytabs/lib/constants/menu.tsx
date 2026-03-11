import {
  BadgeDollarSign,
  BadgePercent,
  ChartNoAxesCombined,
  ChevronDown,
  CirclePlus,
  House,
  Inbox,
  Store,
  Tag,
  Target,
  TvMinimalPlay,
  User,
} from "lucide-react-native";

export const MOCK_FLAT_LIST_ITEMS = [
  {
    title: "Home",
    leftIcon: <House size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Orders",
    leftIcon: <Inbox size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Products",
    leftIcon: <Tag size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Customers",
    leftIcon: <User size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Marketing",
    leftIcon: <Target size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Discounts",
    leftIcon: <BadgePercent size={20} color="#E5E7EB" />,
    rightIcon: null,
  },
  {
    title: "Content",
    leftIcon: <TvMinimalPlay size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Markets",
    leftIcon: <BadgeDollarSign size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Analytics",
    leftIcon: <ChartNoAxesCombined size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Sales channels",
    leftIcon: null,
    rightIcon: <CirclePlus size={20} color="#E5E7EB" />,
  },
  {
    title: "Online Store",
    leftIcon: <Store size={20} color="#E5E7EB" />,
    rightIcon: <ChevronDown size={20} color="#E5E7EB" />,
  },
  {
    title: "Show all channels",
    leftIcon: null,
    rightIcon: null,
  },
  {
    title: "Apps",
    leftIcon: <Store size={20} color="#E5E7EB" />,
    rightIcon: <CirclePlus size={20} color="#E5E7EB" />,
  },
] as const;
