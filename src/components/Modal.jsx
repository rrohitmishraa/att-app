import { motion, AnimatePresence } from "framer-motion";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
}) {
  const sizeClasses = {
    sm: "sm:max-w-md",
    md: "sm:max-w-xl",
    lg: "sm:max-w-3xl",
    wide: "sm:max-w-6xl",
    full: "sm:max-w-[95vw]",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className={`
              relative
              bg-white/90 backdrop-blur-xl
              w-full h-[92vh]
              sm:w-[95%] sm:h-auto
              ${sizeClasses[size]}
              rounded-t-3xl sm:rounded-3xl
              shadow-xl shadow-black/10
              p-5 sm:p-8
              z-10
              flex flex-col
              max-h-[92vh]
              overflow-hidden
            `}
          >
            {title && (
              <div className="mb-6 shrink-0">
                <h3 className="text-2xl font-semibold text-gray-900 tracking-tight">
                  {title}
                </h3>
                <div className="mt-2 h-[2px] w-12 bg-blue-500 rounded-full" />
              </div>
            )}

            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1">
              {children}
            </div>

            {footer && (
              <div className="mt-8 flex justify-end gap-3 shrink-0 pt-4 border-t border-gray-100">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
