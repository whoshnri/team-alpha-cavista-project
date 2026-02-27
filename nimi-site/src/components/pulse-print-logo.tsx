import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

export function VitalPulseLogo({ className }: { className?: string }) {
    return (
        <div className={cn("relative flex items-center justify-center", className)}>
            <div className="absolute inset-0 bg-accent-blue/10 rounded-full animate-ping" />
            <div className="relative bg-background p-2 rounded-full border-2 border-accent-blue/30 ">
                <HeartPulse className="w-full h-full text-accent-blue" />
            </div>
        </div>
    );
}
