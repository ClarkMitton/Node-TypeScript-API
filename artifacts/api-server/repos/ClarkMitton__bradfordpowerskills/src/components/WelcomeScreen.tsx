import { Mic, Layers, Sparkles, ArrowRight, GraduationCap, Briefcase, TrendingUp } from "lucide-react";
import heroFlow from "@/assets/hero-flow.jpg";
import cardFlow1 from "@/assets/card-flow-1.jpg";
import cardFlow2 from "@/assets/card-flow-2.jpg";
import cardFlow3 from "@/assets/card-flow-3.jpg";

export type AnalysisMode = "quick" | "deep-dive" | "full-review" | "video-analysis" | "compare-sessions";
export type UserRole = "trainee" | "staff";

interface WelcomeScreenProps {
  onSelectMode: (mode: AnalysisMode) => void;
  onSelectRole?: (role: UserRole) => void;
  selectedRole?: UserRole | null;
}

export function WelcomeScreen({
  onSelectMode,
  onSelectRole,
  selectedRole = null,
}: WelcomeScreenProps) {

  const roleOptions = [
    {
      id: "trainee" as const,
      icon: GraduationCap,
      title: "I am a Teacher Training Student",
      description: "Get feedback aligned to the ITT & Early Career Framework with progression stages",
      encouragement: "Tailored to your training journey with ITTECF indicators.",
      image: cardFlow1,
    },
    {
      id: "staff" as const,
      icon: Briefcase,
      title: "I am a Teaching Member of Staff",
      description: "Get comprehensive feedback with star ratings and Ofsted-aligned assessment",
      encouragement: "Designed for experienced practitioners seeking development.",
      image: cardFlow2,
    },
  ];

  const feedbackOptions = [
    {
      id: "quick" as const,
      icon: Mic,
      title: "Audio Only Feedback",
      description: "Get instant feedback on any teaching moment — a full lesson, a short activity, or just a segment you want to reflect on.",
      details: ["Record or upload audio", "Auto-transcription", "Delivery-focused feedback"],
      encouragement: "Perfect for everyday practice — use it anytime you want a quick reflection on your delivery.",
      image: cardFlow1,
    },
    {
      id: "full-review" as const,
      icon: Layers,
      title: "Deep Dive Feedback",
      description: "Comprehensive feedback on the complete teaching cycle — from planning through delivery to student outcomes.",
      details: ["Audio recording", "Lesson plan & scaffolding", "3 pieces of student work"],
      encouragement: "Perfect for deep reflection — connect your planning, delivery, and student outcomes for powerful professional growth.",
      image: cardFlow2,
    },
    {
      id: "compare-sessions" as const,
      icon: TrendingUp,
      title: "Analyse My Development",
      description: "Upload two previous PowerED reports to see how your teaching has developed across sessions.",
      details: ["Upload two downloaded reports", "Identifies your earlier and later session automatically", "Generates a personalised teaching journey summary"],
      encouragement: "See your growth patterns, celebrate embedded practice, and pinpoint your next development focus.",
      image: cardFlow3,
    },
  ];

  // Hero section
  const HeroSection = ({ subtitle }: { subtitle: string }) => (
    <div className="relative rounded-full overflow-hidden mx-auto" style={{ maxWidth: '800px', aspectRatio: '3/1' }}>
      <img src={heroFlow} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/30 to-background/60 flex items-center justify-center">
        <div className="text-center space-y-2 px-4">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-foreground text-balance drop-shadow-sm">
            PowerED
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto text-balance">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );

  const PrivacyNotice = () => (
    <div className="bg-accent-soft border border-accent/20 rounded-full py-3 px-6 text-center max-w-2xl mx-auto">
      <p className="text-sm text-foreground">
        <strong>Privacy First:</strong> No data is stored permanently. Sessions are cleared when you close the browser.
      </p>
    </div>
  );

  // Role selection (first step)
  if (!selectedRole && onSelectRole) {
    return (
      <div className="section-fade-in space-y-8">
        <HeroSection subtitle="Your personal teaching coach" />
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-xl font-heading font-semibold text-foreground">
            Which best describes you?
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {roleOptions.map((option, index) => (
            <button
              key={option.id}
              onClick={() => onSelectRole(option.id)}
              className="group animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative w-40 h-40 rounded-full overflow-hidden border-4 border-border shadow-lg group-hover:border-primary/50 group-hover:shadow-xl transition-all duration-300">
                  <img src={option.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-background/30 group-hover:bg-background/10 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                      <option.icon className="w-8 h-8 text-primary-foreground" />
                    </div>
                  </div>
                </div>
                <h3 className="font-heading font-semibold text-foreground text-lg">
                  {option.title}
                </h3>
                <p className="text-muted-foreground text-sm max-w-[250px]">
                  {option.description}
                </p>
                <div className="flex items-start gap-2 p-3 rounded-full bg-success/10 border border-success/20 px-5">
                  <Sparkles className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-success font-medium">
                    {option.encouragement}
                  </p>
                </div>
                <div className="flex items-center text-primary font-medium">
                  <span className="text-sm">Get Started</span>
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>
          ))}
        </div>
        <PrivacyNotice />
      </div>
    );
  }

  // Mode selection (second step — 3 cards)
  return (
    <div className="section-fade-in space-y-8">
      <HeroSection subtitle="Choose the type of feedback you'd like to receive." />

      <div className="text-center space-y-2 mb-6">
        <h2 className="text-xl font-heading font-semibold text-foreground">
          What would you like to do?
        </h2>
        {selectedRole === "trainee" && (
          <p className="text-sm text-primary font-medium">
            🎓 Trainee mode: Feedback aligned to the ITT & Early Career Framework
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {feedbackOptions.map((option, index) => (
          <button
            key={option.id}
            onClick={() => onSelectMode(option.id)}
            className="group animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-border shadow-lg group-hover:border-primary/50 group-hover:shadow-xl transition-all duration-300">
                <img src={option.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-background/30 group-hover:bg-background/10 transition-colors" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                    <option.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                </div>
              </div>
              <h3 className="font-heading font-semibold text-foreground text-base">
                {option.title}
              </h3>
              <p className="text-muted-foreground text-sm max-w-[240px]">
                {option.description}
              </p>

              {option.encouragement && (
                <div className="flex items-start gap-2 p-3 rounded-full bg-success/10 border border-success/20 px-4">
                  <Sparkles className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-success font-medium">
                    {option.encouragement}
                  </p>
                </div>
              )}

              <ul className="space-y-1.5">
                {option.details.map((detail, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-center gap-2 justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </button>
        ))}
      </div>

      <PrivacyNotice />
    </div>
  );
}
