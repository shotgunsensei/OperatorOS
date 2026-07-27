import { Link } from "wouter";
import { XCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function CheckoutCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass p-10 rounded-3xl max-w-md w-full text-center border-red-500/20"
      >
        <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold font-display mb-4">Payment Cancelled</h1>
        <p className="text-muted-foreground mb-8">
          Your checkout process was cancelled. You have not been charged.
        </p>
        <div className="space-y-3">
          <Link href="/pricing" className="block w-full py-4 rounded-xl bg-ninja-red text-white font-bold red-glow hover:-translate-y-0.5 transition-all">
            Return to Pricing
          </Link>
          <Link href="/" className="block w-full py-4 rounded-xl bg-white/5 hover:bg-white/10 font-medium transition-colors">
            Go Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
