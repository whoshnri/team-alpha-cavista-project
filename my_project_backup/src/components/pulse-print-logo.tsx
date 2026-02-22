import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

export function VitalPulseLogo({ className }: { className?: string }) {
    return (
        <div className={cn("relative flex items-center justify-center", className)}>
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative bg-background p-2 rounded-full border-2 border-primary ">
                <HeartPulse className="w-full h-full text-primary" />
            </div>
        </div>
    );
}
