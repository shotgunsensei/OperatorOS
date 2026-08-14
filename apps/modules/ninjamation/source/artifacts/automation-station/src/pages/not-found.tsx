import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <AlertCircle className="w-16 h-16 text-ninja-red mx-auto mb-6 opacity-80" />
        <h1 className="text-4xl font-bold font-display mb-4">404 - Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The script or page you are looking for doesn't exist or has been moved.
        </p>
        <Link href="/" className="inline-flex px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-medium transition-colors">
          Return Home
        </Link>
      </motion.div>
    </div>
  );
}
