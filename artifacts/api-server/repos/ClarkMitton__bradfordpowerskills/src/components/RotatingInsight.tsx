import { useState, useEffect } from "react";

const TEACHING_INSIGHTS = [
  // Did You Know facts
  { type: "fact", text: "Students retain 90% of what they teach others, compared to just 10% of what they read." },
  { type: "fact", text: "The average teacher makes over 1,500 educational decisions every single day." },
  { type: "fact", text: "Wait time of just 3 seconds after a question increases response quality by up to 300%." },
  { type: "fact", text: "Students form an impression of a teacher's warmth and competence within the first 30 seconds." },
  { type: "fact", text: "Retrieval practice is 50% more effective than re-reading for long-term retention." },
  { type: "fact", text: "The 'testing effect' shows that being quizzed on material produces better learning than additional study time." },
  { type: "fact", text: "Teachers who use student names regularly see a 20% increase in engagement." },
  { type: "fact", text: "Interleaving topics during practice leads to 43% better retention than blocked practice." },
  { type: "fact", text: "The optimal chunk size for new information is 3-4 items at a time." },
  { type: "fact", text: "Formative assessment can double the speed of student learning when done well." },
  { type: "fact", text: "A well-timed pause after a question increases participation from 2-3 students to 8-10." },
  { type: "fact", text: "Dual coding — combining words and visuals — improves recall by up to 89%." },
  { type: "fact", text: "Students who explain their reasoning learn more deeply than those who simply give answers." },
  { type: "fact", text: "Cold calling, when done warmly, increases whole-class engagement by up to 70%." },

  // Inspirational quotes
  { type: "quote", text: "\"The mediocre teacher tells. The good teacher explains. The superior teacher demonstrates. The great teacher inspires.\" — William Arthur Ward" },
  { type: "quote", text: "\"Teaching is the greatest act of optimism.\" — Colleen Wilcox" },
  { type: "quote", text: "\"Every child deserves a champion — an adult who will never give up on them.\" — Rita Pierson" },
  { type: "quote", text: "\"The beautiful thing about learning is that no one can take it away from you.\" — B.B. King" },
  { type: "quote", text: "\"Education is not the filling of a pail, but the lighting of a fire.\" — W.B. Yeats" },
  { type: "quote", text: "\"What we learn with pleasure we never forget.\" — Alfred Mercier" },
  { type: "quote", text: "\"The best teachers are those who show you where to look but don't tell you what to see.\" — Alexandra K. Trenfor" },
  { type: "quote", text: "\"Tell me and I forget, teach me and I remember, involve me and I learn.\" — Benjamin Franklin" },
  { type: "quote", text: "\"A good teacher can inspire hope, ignite the imagination, and instil a love of learning.\" — Brad Henry" },
  { type: "quote", text: "\"Teachers affect eternity; no one can tell where their influence stops.\" — Henry Adams" },
  { type: "quote", text: "\"The task of the modern educator is not to cut down jungles, but to irrigate deserts.\" — C.S. Lewis" },
  { type: "quote", text: "\"Better than a thousand days of diligent study is one day with a great teacher.\" — Japanese Proverb" },
  { type: "quote", text: "\"Teaching kids to count is fine, but teaching them what counts is best.\" — Bob Talbert" },
  { type: "quote", text: "\"In learning you will teach, and in teaching you will learn.\" — Phil Collins" },
];

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function RotatingInsight() {
  const [shuffled] = useState(() => shuffleArray(TEACHING_INSIGHTS));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setIsVisible(false);
      // After fade out, change text and fade in
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % shuffled.length);
        setIsVisible(true);
      }, 500);
    }, 5000);

    return () => clearInterval(interval);
  }, [shuffled.length]);

  const current = shuffled[currentIndex];

  return (
    <div className="w-full max-w-lg mx-auto mt-8">
      <div
        className="transition-opacity duration-500 ease-in-out text-center"
        style={{ opacity: isVisible ? 1 : 0 }}
      >
        <p className="text-sm font-semibold text-primary/70 uppercase tracking-wider mb-3">
          {current.type === "fact" ? "💡 Did you know?" : "✨ Inspiration"}
        </p>
        <p className="text-lg text-muted-foreground leading-relaxed italic">
          {current.text}
        </p>
      </div>
    </div>
  );
}
