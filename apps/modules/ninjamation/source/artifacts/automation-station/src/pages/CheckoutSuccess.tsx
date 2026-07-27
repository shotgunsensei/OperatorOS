import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function CheckoutSuccess() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass p-10 rounded-3xl max-w-md w-full text-center border-green-500/20 shadow-[0_0_50px_rgba(34,197,94,0.1)]"
      >
        <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold font-display mb-4">Payment Successful!</h1>
        <p className="text-muted-foreground mb-8">
          Thank you for subscribing to Ninjamation. Your account has been upgraded and you now have full access.
        </p>
        <Link href="/library" className="block w-full py-4 rounded-xl bg-ninja-red text-white font-bold red-glow hover:-translate-y-0.5 transition-all">
          Go to Library
        </Link>
      </motion.div>
    </div>
  );
}
