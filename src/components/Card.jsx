import { motion } from "framer-motion";

export default function Card({
  children,
  inactive = false,
  layout = true,
  className = "",
}) {
  return (
    <motion.div
      layout={layout}
      className={`rounded-2xl bg-white p-6 shadow-md transition ${
        inactive ? "opacity-60" : ""
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}
