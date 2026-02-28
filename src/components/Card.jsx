import { motion } from "framer-motion";

export default function Card({
  children,
  inactive = false,
  layout = true,
  hover = true,
  padding = "default",
  className = "",
}) {
  const paddingMap = {
    none: "",
    sm: "p-4",
    default: "p-6",
    lg: "p-8",
  };

  return (
    <motion.div
      layout={layout}
      whileHover={hover ? { y: -4 } : undefined}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={`
        rounded-3xl
        bg-white/80 backdrop-blur-sm
        shadow-md shadow-black/5
        ${hover ? "hover:shadow-lg" : ""}
        transition-all duration-300
        ${inactive ? "opacity-50 bg-gray-100/80 border border-gray-200" : ""}
        ${paddingMap[padding]}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
