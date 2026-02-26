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
        >
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`
              relative bg-white
              w-full h-[92vh]
              sm:w-[95%] sm:h-auto
              ${sizeClasses[size]}
              rounded-t-2xl sm:rounded-2xl
              shadow-2xl
              p-4 sm:p-6
              z-10
              flex flex-col
              max-h-[92vh]
              overflow-hidden
            `}
          >
            {/* Header */}
            {title && (
              <h3 className="text-lg font-semibold mb-4 shrink-0">{title}</h3>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="mt-6 flex justify-end gap-3 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
