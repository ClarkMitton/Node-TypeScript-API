import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

// Pedagogical terms with detailed explanations
export const PEDAGOGICAL_TERMS: Record<string, { short: string; detailed: string }> = {
  "wait time": {
    short: "The pause after asking a question",
    detailed: "Wait time is the duration a teacher pauses after asking a question before calling on a student or rephrasing. Research by Mary Budd Rowe found that extending wait time to 3-5 seconds increases both the length and quality of student responses, encourages more students to participate, and promotes higher-order thinking."
  },
  "cold calling": {
    short: "Randomly selecting students to respond",
    detailed: "Cold calling is a technique where teachers call on students to answer questions regardless of whether they've raised their hands. When done supportively, it increases engagement because all students know they might be called upon. It also provides better formative assessment data and ensures quieter students have a voice."
  },
  "think-pair-share": {
    short: "Think alone, discuss with partner, share with class",
    detailed: "Think-Pair-Share is a cooperative learning strategy where students first think individually about a question, then discuss their ideas with a partner, and finally share with the whole class. This scaffolds participation, gives processing time, and ensures every student engages with the content before whole-class discussion."
  },
  "scaffolding": {
    short: "Breaking complex tasks into manageable steps",
    detailed: "Scaffolding refers to instructional techniques that break down learning into chunks, providing temporary supports that help students achieve higher levels of understanding. Like construction scaffolding, these supports are gradually removed as students develop competency. This comes from Vygotsky's Zone of Proximal Development theory."
  },
  "bloom's taxonomy": {
    short: "Hierarchy of thinking skills",
    detailed: "Bloom's Taxonomy is a framework classifying educational learning objectives into levels of complexity: Remember, Understand, Apply, Analyse, Evaluate, and Create. Lower-order skills (Remember, Understand) involve recalling facts, whilst higher-order skills (Analyse, Evaluate, Create) require deeper cognitive processing and critical thinking."
  },
  "multiple entry points": {
    short: "Different ways to access the same content",
    detailed: "Multiple entry points is a differentiation strategy providing various ways for students to engage with content based on their readiness, interests, or learning preferences. This might include visual, auditory, or kinaesthetic approaches, or varying complexity levels whilst maintaining the same core learning objective."
  },
  "cognitive load": {
    short: "Mental effort required to process information",
    detailed: "Cognitive Load Theory, developed by John Sweller, explains how the brain processes new information. When too much information is presented at once, working memory becomes overloaded and learning suffers. Effective teaching manages cognitive load by breaking content into chunks, eliminating extraneous information, and building on prior knowledge."
  },
  "formative assessment": {
    short: "Checking understanding during learning",
    detailed: "Formative assessment is ongoing evaluation during the learning process, used to monitor student progress and inform instruction. Unlike summative assessment (tests at the end), formative assessment provides real-time feedback that helps teachers adjust their teaching and helps students identify areas for improvement."
  },
  "higher-order questioning": {
    short: "Questions requiring analysis, evaluation, or creation",
    detailed: "Higher-order questions require students to think beyond simple recall. Based on Bloom's Taxonomy, these questions ask students to analyse (break down information), evaluate (make judgements), or create (produce new ideas). Examples include 'Why do you think...?', 'What evidence supports...?', and 'How would you improve...?'"
  },
  "distributed practice": {
    short: "Spreading learning over time",
    detailed: "Distributed practice (also called spaced practice) involves spreading learning sessions over time rather than massing them together (cramming). Research consistently shows this leads to better long-term retention. The 'spacing effect' is one of the most robust findings in cognitive psychology."
  },
  "checking for understanding": {
    short: "Verifying students grasp concepts before moving on",
    detailed: "Checking for understanding (CFU) involves using various techniques to verify student comprehension during instruction. Effective CFU goes beyond asking 'Does everyone understand?' and includes specific probing questions, exit tickets, thumbs up/down, or quick written responses that reveal actual understanding."
  },
  "eliciting responses": {
    short: "Drawing out student thinking and participation",
    detailed: "Eliciting responses refers to techniques teachers use to encourage students to share their thinking. This includes strategic questioning, providing adequate wait time, using non-verbal cues, and creating a safe classroom environment where students feel comfortable taking intellectual risks."
  },
  "differentiation": {
    short: "Adapting instruction to meet individual needs",
    detailed: "Differentiation is the practice of modifying instruction to meet diverse student needs. This can involve differentiating content (what students learn), process (how they learn it), product (how they demonstrate learning), or environment. The goal is ensuring all students can access and engage with meaningful learning."
  },
  "metacognition": {
    short: "Thinking about one's own thinking",
    detailed: "Metacognition is awareness and understanding of one's own thought processes. Teaching metacognitive strategies helps students plan their approach to learning, monitor their comprehension, and evaluate their progress. Research shows explicit metacognitive instruction significantly improves learning outcomes."
  },
  "zone of proximal development": {
    short: "The gap between what students can do alone vs. with help",
    detailed: "Vygotsky's Zone of Proximal Development (ZPD) describes the space between what a learner can accomplish independently and what they can achieve with guidance. Effective instruction targets this zone, providing appropriate challenge with sufficient support to promote growth."
  },
  "pose-pause-pounce-bounce": {
    short: "Strategic questioning technique for deeper engagement",
    detailed: "Pose-Pause-Pounce-Bounce is a questioning strategy: Pose a question to the class, Pause to allow thinking time, Pounce on a student to answer, then Bounce that answer to another student for comment or extension. This technique increases engagement, promotes active listening, and develops collaborative dialogue."
  },
  "no-hands-up": {
    short: "Teacher selects who answers rather than volunteers",
    detailed: "No-hands-up is a classroom management strategy where students don't raise hands to volunteer answers. Instead, the teacher selects who responds. This ensures all students stay engaged and prepared, prevents the same students from dominating, and allows the teacher to strategically target questions."
  },
  "exit ticket": {
    short: "Quick end-of-lesson check of understanding",
    detailed: "Exit tickets are brief formative assessments completed at the end of a lesson. Students respond to a prompt or question, allowing teachers to quickly gauge understanding and identify misconceptions. This data informs planning for the next lesson and helps identify students who need additional support."
  },
  "modelling": {
    short: "Demonstrating thinking or skills explicitly",
    detailed: "Modelling involves the teacher explicitly demonstrating a skill, process, or way of thinking. This might include 'thinking aloud' to make cognitive processes visible, or showing step-by-step how to complete a task. Effective modelling makes expert thinking accessible to learners."
  },
  "retrieval practice": {
    short: "Actively recalling information from memory",
    detailed: "Retrieval practice involves actively recalling information from memory rather than passively reviewing it. Research shows that the act of retrieval strengthens memory more than re-reading or highlighting. Techniques include low-stakes quizzes, flashcards, and asking students to write what they remember."
  },
  // Additional pedagogical terms
  "active learning": {
    short: "Engaging students in the learning process",
    detailed: "Active learning involves instructional methods that engage students directly in the learning process through activities, discussions, problem-solving, and collaboration rather than passive listening. Research shows active learning significantly improves student outcomes compared to traditional lectures."
  },
  "prior knowledge activation": {
    short: "Connecting new learning to what students already know",
    detailed: "Prior knowledge activation involves helping students recall and connect what they already know to new content. This builds neural pathways between existing and new knowledge, making learning more meaningful and memorable. Techniques include KWL charts, brainstorming, and preview questions."
  },
  "dual coding": {
    short: "Combining words and visuals for better learning",
    detailed: "Dual Coding Theory suggests learning improves when information is presented both verbally and visually. The brain processes words and images through different channels, and combining them creates stronger memory traces. Effective use includes diagrams with explanations, annotated images, and visual metaphors."
  },
  "spaced repetition": {
    short: "Reviewing at increasing intervals",
    detailed: "Spaced repetition is a learning technique where review sessions are spaced out over increasing intervals. Each successful recall strengthens the memory and allows for longer intervals before the next review. This is one of the most effective evidence-based learning strategies."
  },
  "interleaving": {
    short: "Mixing different topics during practice",
    detailed: "Interleaving involves mixing different topics or problem types during practice rather than focusing on one type at a time (blocking). While it may feel harder, research shows interleaving leads to better long-term retention and transfer of learning to new situations."
  },
  "concrete examples": {
    short: "Using specific instances to illustrate concepts",
    detailed: "Concrete examples make abstract concepts tangible and understandable. By providing specific, relatable instances, teachers help students build accurate mental models. Multiple varied examples help students identify the essential features of a concept and transfer understanding to new contexts."
  },
  "elaborative interrogation": {
    short: "Asking 'why' and 'how' questions",
    detailed: "Elaborative interrogation involves prompting students to explain why facts or concepts are true. This 'why' questioning encourages deeper processing and helps students connect new information to existing knowledge, leading to better understanding and retention."
  },
  "self-explanation": {
    short: "Students explaining their thinking process",
    detailed: "Self-explanation is a strategy where students explain their thinking, reasoning, or problem-solving process to themselves. This metacognitive activity helps identify gaps in understanding, strengthens memory, and develops deeper comprehension of material."
  },
  "positive reinforcement": {
    short: "Rewarding desired behaviours",
    detailed: "Positive reinforcement involves providing a rewarding consequence after a desired behaviour, making it more likely to occur again. In teaching, this includes specific praise, recognition, and encouragement that reinforces effort, progress, and achievement."
  },
  "inclusive practice": {
    short: "Ensuring all students can participate and succeed",
    detailed: "Inclusive practice involves teaching strategies that ensure all students, regardless of ability, background, or learning needs, can fully participate and achieve. This includes accessible materials, varied teaching methods, and a welcoming classroom culture."
  },
  "questioning techniques": {
    short: "Strategic use of questions to promote learning",
    detailed: "Questioning techniques encompass various strategies for using questions effectively in teaching. This includes varying question types (open/closed, convergent/divergent), using wait time, targeting questions appropriately, and using follow-up probes to deepen thinking."
  },
  "feedback loop": {
    short: "Cycle of providing and acting on feedback",
    detailed: "A feedback loop is the ongoing cycle where students receive feedback, act on it, and then receive further feedback. Effective feedback loops are timely, specific, and actionable, helping students understand their current performance and how to improve."
  },
  "learning intentions": {
    short: "Clear statements of what students will learn",
    detailed: "Learning intentions (or objectives) are clear statements of what students should know, understand, or be able to do by the end of a lesson. When shared with students, they provide focus and help students understand the purpose of activities and how to recognise success."
  },
  "success criteria": {
    short: "How students know they've achieved the goal",
    detailed: "Success criteria describe what successful learning looks like. They provide students with clear indicators of quality and help them self-assess their work. Effective success criteria are specific, measurable, and co-constructed with students when appropriate."
  },
  "stretch and challenge": {
    short: "Extending learning for higher-attaining students",
    detailed: "Stretch and challenge involves providing extension activities and higher-order thinking opportunities for students who have mastered the basic content. This ensures all students are appropriately challenged and continues to develop skills in depth, breadth, and complexity."
  },
  "growth mindset": {
    short: "Belief that abilities can be developed",
    detailed: "Growth mindset, developed by Carol Dweck, is the belief that intelligence and abilities can be developed through effort, strategies, and help from others. Teachers foster growth mindset by praising effort over innate ability, normalising mistakes, and teaching about brain plasticity."
  },
  "desirable difficulties": {
    short: "Challenges that enhance long-term learning",
    detailed: "Desirable difficulties are learning conditions that make initial learning more challenging but lead to better long-term retention and transfer. Examples include interleaving, spaced practice, and testing. While they may slow initial performance, they enhance durable learning."
  },
  "collaborative learning": {
    short: "Students working together to learn",
    detailed: "Collaborative learning involves students working together in pairs or groups to solve problems, complete tasks, or understand new concepts. When structured well, it develops communication skills, deepens understanding through discussion, and exposes students to different perspectives."
  },
  "peer assessment": {
    short: "Students evaluating each other's work",
    detailed: "Peer assessment involves students providing feedback on each other's work using clear criteria. This develops critical evaluation skills, reinforces success criteria, and often provides timely feedback. Research shows students learn both from giving and receiving peer feedback."
  },
  "worked examples": {
    short: "Step-by-step demonstrations of problem-solving",
    detailed: "Worked examples are step-by-step demonstrations showing how an expert solves a problem or completes a task. They reduce cognitive load for novice learners by allowing them to focus on understanding the process rather than generating solutions from scratch."
  },
  "purposeful start": {
    short: "Beginning lessons with clear direction and engagement",
    detailed: "A purposeful start ensures lessons begin promptly with engaging activities that focus attention, activate prior knowledge, and clearly communicate the learning purpose. This maximises learning time and sets a positive tone for the session."
  },
  "student welcome": {
    short: "Greeting students to build rapport",
    detailed: "Student welcome involves greeting students individually as they enter, using names and showing genuine interest. This builds positive relationships, helps students feel valued, and creates a welcoming atmosphere that supports learning."
  },
  "marketplace activity": {
    short: "Students moving around to gather information",
    detailed: "A marketplace activity is a collaborative technique where information or work is displayed around the room, and students move between 'stalls' to gather, discuss, or evaluate content. This promotes movement, peer learning, and engagement with multiple perspectives."
  },
  "student voice": {
    short: "Giving students opportunity to express views",
    detailed: "Student voice involves creating opportunities for students to share their opinions, perspectives, and feedback on their learning experience. This develops ownership, makes learning more relevant, and provides valuable insights for teachers to improve their practice."
  },
  "real-world application": {
    short: "Connecting learning to authentic contexts",
    detailed: "Real-world application involves linking classroom learning to genuine situations outside school. This increases motivation by showing relevance, develops transfer skills, and helps students see the practical value of what they're learning."
  },
  "diagnostic questioning": {
    short: "Questions that probe student understanding",
    detailed: "Diagnostic questioning involves asking targeted questions to uncover what students understand, identify misconceptions, and reveal their thinking processes. These questions go beyond checking for correct answers to explore 'Why do you think that?' and 'How did you work that out?' This provides valuable formative assessment data to inform instruction."
  },
  "diagnostic questions": {
    short: "Questions that probe student understanding",
    detailed: "Diagnostic questions are targeted queries designed to uncover what students understand, identify misconceptions, and reveal thinking processes. They go beyond right/wrong to explore reasoning with questions like 'Why?' and 'How do you know?'"
  },
  "probing questions": {
    short: "Follow-up questions that dig deeper",
    detailed: "Probing questions are follow-up queries that dig deeper into student responses. They push students to elaborate, clarify, or justify their thinking. Examples include 'Can you tell me more?', 'What makes you say that?', and 'What evidence supports your answer?'"
  },
  "hinge questions": {
    short: "Key questions that determine lesson direction",
    detailed: "Hinge questions are carefully designed diagnostic questions asked at critical points in a lesson. The responses quickly reveal whether students are ready to move on or need reteaching. They should be answerable in under a minute and provide clear insight into understanding."
  },
  "mini whiteboard": {
    short: "Individual boards for whole-class response",
    detailed: "Mini whiteboards (or show-me boards) allow every student to display their answer simultaneously, giving teachers instant formative assessment data. They increase participation, provide immediate feedback, and help identify misconceptions across the whole class."
  },
  "mini whiteboards": {
    short: "Individual boards for whole-class response",
    detailed: "Mini whiteboards (or show-me boards) allow every student to display their answer simultaneously, giving teachers instant formative assessment data. They increase participation, provide immediate feedback, and help identify misconceptions across the whole class."
  },
  "choral response": {
    short: "Whole class answering together",
    detailed: "Choral response involves the entire class responding to a question in unison. It's useful for reinforcing factual information, building confidence before individual responses, and ensuring all students actively participate."
  },
  "oracy": {
    short: "Teaching students to articulate ideas clearly",
    detailed: "Oracy refers to the ability to express oneself clearly in spoken language. Teaching oracy involves developing students' speaking and listening skills, enabling them to articulate ideas, justify opinions, and engage in academic discourse."
  },
  "turn and talk": {
    short: "Quick partner discussion",
    detailed: "Turn and talk (also called talk partners) involves students briefly turning to a neighbour to discuss a question or idea. It provides thinking time, encourages participation from all students, and helps them formulate responses before sharing with the class."
  },
  "talk partners": {
    short: "Paired discussion for thinking time",
    detailed: "Talk partners involves pairing students to discuss ideas before sharing with the class. This provides processing time, builds confidence, ensures every student engages, and often produces higher-quality responses."
  },
  "no opt out": {
    short: "Ensuring all students provide an answer",
    detailed: "No opt out is a technique where teachers don't allow 'I don't know' as a final answer. If a student can't answer, the teacher provides support (another student's answer, a hint, or scaffolding) then returns to the original student to say the correct answer. This maintains high expectations."
  },
  "live marking": {
    short: "Marking work with students in real-time",
    detailed: "Live marking involves teachers marking student work while circulating during the lesson, providing immediate feedback. This gives students instant actionable feedback they can act on immediately, making it more impactful than delayed written feedback."
  },
  "stretch question": {
    short: "Extension question for deeper thinking",
    detailed: "Stretch questions are extension questions designed to push students beyond the basic content to develop deeper understanding. They often require application, analysis, or evaluation and are used to challenge higher-attaining students or extend thinking for all."
  },
  "stretch questions": {
    short: "Extension questions for deeper thinking",
    detailed: "Stretch questions are extension questions designed to push students beyond the basic content to develop deeper understanding. They often require application, analysis, or evaluation and are used to challenge higher-attaining students or extend thinking for all."
  },
  "verbal feedback": {
    short: "Spoken feedback during learning",
    detailed: "Verbal feedback is spoken feedback given during the lesson. When specific and actionable, it's often more effective than written feedback because students can immediately ask clarifying questions and act on it. It should be focused on what to improve and how."
  },
  "responsive questioning": {
    short: "Adapting questions based on student responses",
    detailed: "Responsive questioning involves adjusting questions based on student answers. Teachers probe deeper when students give brief answers, scaffold when students struggle, and extend when students show strong understanding. This tailors challenge to individual needs."
  },
  "clarifying questions": {
    short: "Questions to check meaning and understanding",
    detailed: "Clarifying questions are used to ensure understanding of what a student has said or to prompt them to express their ideas more clearly. They help avoid misunderstandings and push students to articulate their thinking more precisely."
  },
  "extension questions": {
    short: "Questions that push thinking further",
    detailed: "Extension questions take student thinking beyond the initial answer. They might ask students to apply knowledge to new contexts, make connections, evaluate alternatives, or consider implications. They ensure higher-attaining students are appropriately challenged."
  },
  "redirecting": {
    short: "Moving discussion to another student",
    detailed: "Redirecting involves taking a student's response and directing it to another student for comment, evaluation, or extension. This increases engagement, develops listening skills, and creates a more dialogic classroom where students build on each other's ideas."
  },
  "revoicing": {
    short: "Restating student ideas for clarity",
    detailed: "Revoicing is when a teacher repeats or paraphrases a student's contribution, often to make it clearer, give it legitimacy, or highlight its importance. It validates student thinking while ensuring the whole class hears and understands the idea."
  },
  "teacher talk": {
    short: "How much the teacher speaks vs students",
    detailed: "Teacher talk refers to the proportion of classroom time the teacher spends talking versus student participation. Research suggests reducing excessive teacher talk and increasing student talk leads to deeper learning and better engagement."
  },
  "student talk": {
    short: "Student verbal participation in learning",
    detailed: "Student talk refers to opportunities for students to express their thinking verbally. Increasing quality student talk - through discussion, explanation, and collaborative dialogue - deepens understanding and develops communication skills."
  },
  "academic vocabulary": {
    short: "Subject-specific language and terminology",
    detailed: "Academic vocabulary refers to the specialised language used in educational settings and specific subjects. Explicitly teaching and reinforcing academic vocabulary helps students access challenging texts and communicate precisely about complex ideas."
  },
  "sentence stems": {
    short: "Starter phrases to support responses",
    detailed: "Sentence stems are partial sentences provided to students to help structure their responses. Examples include 'I think... because...' or 'Building on what [student] said...'. They scaffold academic language use and support students in formulating complete, well-structured answers."
  },
  "sentence starters": {
    short: "Phrases to begin responses",
    detailed: "Sentence starters are prompts that help students begin their responses in structured ways. They scaffold academic language, support articulation of ideas, and help students develop habits of justification and elaboration."
  },
  "targeted questioning": {
    short: "Directing questions to specific students strategically",
    detailed: "Targeted questioning involves deliberately directing questions to specific students based on their needs - perhaps to check a struggling student's understanding, challenge a high-attainer, or bring a disengaged student back into the lesson."
  },
  "ratio": {
    short: "Balance of teacher vs student work/talk",
    detailed: "Ratio refers to the balance of cognitive work between teacher and students. High ratio teaching pushes more thinking onto students rather than the teacher doing the intellectual heavy lifting. This includes shifting from teacher explanations to student discovery and discussion."
  },
  "all-student response": {
    short: "Every student responds simultaneously",
    detailed: "All-student response techniques (like mini whiteboards, finger voting, or response cards) require every student to provide an answer at the same time. This increases engagement and gives teachers immediate whole-class formative assessment data."
  },
  "adaptive teaching": {
    short: "Adjusting instruction in response to student needs",
    detailed: "Adaptive teaching involves modifying teaching approaches in real-time based on what students demonstrate they need. Rather than a one-size-fits-all approach, teachers adapt explanations, tasks, and support based on ongoing assessment of understanding."
  },
  "assessment for learning": {
    short: "Using assessment to improve learning, not just measure it",
    detailed: "Assessment for Learning (AfL) is the process of seeking and interpreting evidence to decide where learners are, where they need to go, and how best to get there. It's formative in nature and emphasises feedback that moves learning forward."
  },
  "behaviour for learning": {
    short: "Creating conditions for productive learning behaviours",
    detailed: "Behaviour for Learning focuses on developing students' learning dispositions rather than just managing compliance. It builds engagement, resilience, and positive attitudes towards learning through establishing routines, expectations, and a supportive environment."
  },
  "challenge": {
    short: "Pushing students beyond their comfort zone",
    detailed: "Challenge in teaching means setting high expectations and providing tasks that stretch students' thinking. Effective challenge sits within the zone of proximal development — difficult enough to promote growth, but achievable with effort and support."
  },
  "chunking": {
    short: "Breaking information into smaller pieces",
    detailed: "Chunking involves breaking complex information or tasks into smaller, manageable segments. Based on cognitive load theory, this prevents working memory overload and allows students to process and retain information more effectively before building to greater complexity."
  },
  "classroom climate": {
    short: "The emotional and social atmosphere in the room",
    detailed: "Classroom climate encompasses the social, emotional, and physical environment of the classroom. A positive climate — characterised by mutual respect, high expectations, and psychological safety — significantly impacts student engagement, willingness to take risks, and learning outcomes."
  },
  "co-construction": {
    short: "Building understanding together with students",
    detailed: "Co-construction involves teachers and students jointly developing ideas, success criteria, or knowledge. Rather than the teacher presenting finished ideas, students actively contribute to building understanding, which increases ownership, engagement, and deeper learning."
  },
  "convergent questions": {
    short: "Questions with a single correct answer",
    detailed: "Convergent questions have one right answer and test recall or comprehension. They're useful for checking factual knowledge and building foundations, but should be balanced with divergent questions that allow for multiple valid responses and deeper thinking."
  },
  "divergent questions": {
    short: "Questions with multiple valid answers",
    detailed: "Divergent questions invite a range of possible responses and encourage creative, evaluative, or analytical thinking. They promote discussion, allow students to express different perspectives, and develop higher-order thinking skills."
  },
  "do now": {
    short: "Short starter activity at the beginning of a lesson",
    detailed: "A 'Do Now' is a brief, independent activity students complete as soon as they enter the classroom. It settles students, activates prior knowledge or retrieves previous learning, and maximises learning time by establishing a purposeful start."
  },
  "do now activity": {
    short: "Short starter task at lesson beginning",
    detailed: "A 'Do Now' activity is a brief independent task completed immediately upon entering the classroom. It settles the class, establishes routines, and typically involves retrieval practice or prior knowledge activation to maximise learning time."
  },
  "effective explanation": {
    short: "Clear, structured teacher input that builds understanding",
    detailed: "Effective explanations break down complex ideas using clear language, analogies, examples, and visual aids. They manage cognitive load, connect to prior knowledge, and check understanding throughout. Good explanations are concise and avoid unnecessary information."
  },
  "embedding": {
    short: "Securing knowledge in long-term memory",
    detailed: "Embedding refers to the process of moving knowledge from short-term to long-term memory through repeated practice, revisiting, and application in different contexts. Techniques like retrieval practice, spaced repetition, and interleaving support embedding."
  },
  "engagement": {
    short: "Active involvement in the learning process",
    detailed: "Engagement goes beyond compliance — it means students are actively thinking about and processing content. Cognitive engagement (thinking hard about the right things) matters more than behavioural engagement (appearing busy). Effective tasks promote both."
  },
  "feedback": {
    short: "Information given to improve performance",
    detailed: "Effective feedback is specific, timely, and actionable. Research by Hattie and Timperley identifies three key questions: Where am I going? How am I going? Where to next? The most impactful feedback focuses on the task and process rather than the person."
  },
  "fading": {
    short: "Gradually removing support as students gain confidence",
    detailed: "Fading is the deliberate, gradual withdrawal of scaffolding as students develop competence. Teachers systematically reduce prompts, worked examples, or support structures to build student independence and self-regulation."
  },
  "gallery walk": {
    short: "Students move around to view and respond to displayed work",
    detailed: "A gallery walk involves students circulating around the classroom to view work, ideas, or information displayed on walls or tables. They discuss, comment, or build on what they see. This promotes movement, peer learning, and exposure to different perspectives."
  },
  "guided practice": {
    short: "Supported practice before independent work",
    detailed: "Guided practice is the bridge between teacher modelling and independent work. Students attempt tasks with teacher support, checking, and corrective feedback. This 'We do' phase of instruction ensures students can succeed before practising independently."
  },
  "i do, we do, you do": {
    short: "Gradual release of responsibility model",
    detailed: "This instructional framework moves from teacher demonstration ('I do'), through collaborative practice ('We do'), to independent application ('You do'). It gradually transfers responsibility to students, ensuring they have sufficient modelling and support before working alone."
  },
  "independent practice": {
    short: "Students working on their own to apply learning",
    detailed: "Independent practice is when students apply what they've learned without direct teacher support. It's the 'You do' phase that consolidates learning, builds fluency, and helps transfer knowledge to long-term memory. It should only follow adequate modelling and guided practice."
  },
  "knowledge organiser": {
    short: "Summary document of key knowledge for a topic",
    detailed: "A knowledge organiser is a document that sets out the essential knowledge students need for a topic on a single page. It typically includes key vocabulary, dates, facts, concepts, and diagrams. Students use them for self-quizzing, revision, and reference."
  },
  "low-stakes quiz": {
    short: "Quick test without pressure or grades",
    detailed: "Low-stakes quizzes are brief, ungraded assessments used to promote retrieval practice and check understanding. Because they carry no penalties, students feel safe to engage honestly, providing valuable formative data while strengthening memory through the testing effect."
  },
  "low-stakes testing": {
    short: "Testing without high-pressure consequences",
    detailed: "Low-stakes testing involves frequent, informal assessments that carry little or no grade weight. The purpose is to promote retrieval practice (strengthening memory through recall) and provide formative feedback without the anxiety associated with formal exams."
  },
  "mastery": {
    short: "Deep, secure understanding of content",
    detailed: "Mastery learning ensures students fully understand a concept before moving on. Rather than covering content at surface level, mastery approaches provide time for practice, feedback, and consolidation until students demonstrate secure, transferable understanding."
  },
  "misconception": {
    short: "Incorrect understanding that feels right to the learner",
    detailed: "Misconceptions are deeply held but incorrect ideas that students bring to learning. They're resistant to change because they often 'make sense' to the learner. Effective teaching anticipates common misconceptions and uses diagnostic questions and explicit instruction to address them."
  },
  "misconceptions": {
    short: "Common incorrect understandings",
    detailed: "Misconceptions are persistent, incorrect beliefs that students hold about concepts. They often arise from everyday experience or incomplete understanding. Good teaching anticipates misconceptions, surfaces them through diagnostic questioning, and directly addresses them."
  },
  "pace": {
    short: "The speed and rhythm of a lesson",
    detailed: "Pace refers to how quickly a lesson moves and how time is used. Effective pace isn't about rushing — it's about maintaining momentum, minimising dead time, and ensuring activities are appropriately timed so students stay engaged and learning time is maximised."
  },
  "plenary": {
    short: "End-of-lesson review and consolidation",
    detailed: "A plenary is the closing phase of a lesson where learning is reviewed, consolidated, and assessed. Effective plenaries go beyond 'what did we learn today?' to include retrieval, application, or reflection activities that check understanding and set up future learning."
  },
  "precision teaching": {
    short: "Targeted intervention based on specific gaps",
    detailed: "Precision teaching involves identifying exactly what a student can and cannot do, then providing highly targeted instruction to address specific gaps. It uses frequent assessment and data to ensure interventions are precise and effective."
  },
  "prior knowledge": {
    short: "What students already know before the lesson",
    detailed: "Prior knowledge is the existing understanding, skills, and experiences students bring to new learning. Activating and building on prior knowledge creates connections that make new learning meaningful and easier to retain. It's one of the strongest predictors of learning success."
  },
  "purposeful practice": {
    short: "Deliberate, focused repetition to build skills",
    detailed: "Purposeful practice involves focused, goal-directed repetition with feedback. Unlike mindless repetition, purposeful practice targets specific areas for improvement, involves full concentration, and includes mechanisms for identifying and correcting errors."
  },
  "questioning": {
    short: "Using questions strategically to promote thinking",
    detailed: "Effective questioning goes beyond recall to promote deep thinking. It involves planning key questions in advance, using a mix of question types, providing wait time, and following up student responses with probing or extending questions to deepen understanding."
  },
  "recap": {
    short: "Reviewing previous learning",
    detailed: "A recap involves briefly revisiting content from previous lessons. This retrieval practice strengthens memory, identifies gaps, and connects prior learning to new content. Effective recaps are interactive and require students to actively recall rather than passively listen."
  },
  "responsive teaching": {
    short: "Adapting in the moment based on student needs",
    detailed: "Responsive teaching involves making real-time adjustments based on what students demonstrate during the lesson. Teachers use formative assessment data to modify explanations, add scaffolding, adjust pace, or change tasks to better meet emerging needs."
  },
  "rosenshine's principles": {
    short: "Evidence-based instructional strategies",
    detailed: "Rosenshine's Principles of Instruction are ten research-based teaching strategies including: begin with review, present new material in small steps, ask questions, provide models, guide practice, check understanding, obtain high success rates, provide scaffolds, require independent practice, and conduct weekly/monthly review."
  },
  "routine": {
    short: "Established patterns that support learning",
    detailed: "Classroom routines are established, practised procedures that automate transitions and expectations. Well-embedded routines reduce cognitive load on non-learning tasks, minimise disruption, maximise learning time, and create a predictable, safe environment."
  },
  "routines": {
    short: "Established classroom procedures",
    detailed: "Classroom routines are practised, consistent procedures for common activities (entering, transitions, group work, etc.). When routines are well-established, they become automatic, freeing cognitive resources for learning and reducing behaviour management needs."
  },
  "self-assessment": {
    short: "Students evaluating their own work",
    detailed: "Self-assessment involves students reviewing and judging their own work against clear criteria. It develops metacognitive skills, helps students identify strengths and areas for improvement, and builds independence and self-regulation in learning."
  },
  "self-regulation": {
    short: "Managing one's own learning and behaviour",
    detailed: "Self-regulation is the ability to manage one's own behaviour, emotions, and thinking to support learning. Self-regulated learners can plan, monitor, and evaluate their learning. Teaching self-regulation strategies has a high impact on student outcomes."
  },
  "show call": {
    short: "Displaying student work as a teaching tool",
    detailed: "Show Call involves selecting and displaying a student's work to the class as a teaching tool. It can celebrate excellent work, model strong practice, or constructively discuss how to improve. When handled positively, it builds a culture of shared learning."
  },
  "starter activity": {
    short: "Opening task to begin a lesson",
    detailed: "A starter activity is a short task at the beginning of a lesson designed to engage students immediately, activate prior knowledge, or retrieve previous learning. Effective starters are self-explanatory, curriculum-connected, and set the tone for productive learning."
  },
  "summative assessment": {
    short: "Measuring learning at the end of a period",
    detailed: "Summative assessment evaluates student learning at the end of a unit, term, or course against a standard or benchmark. Unlike formative assessment, its primary purpose is to measure and report achievement rather than guide ongoing instruction."
  },
  "talk for writing": {
    short: "Learning text patterns through oral rehearsal",
    detailed: "Talk for Writing, developed by Pie Corbett, uses spoken language to support writing development. Students internalise text structures through imitation (learning a model text orally), innovation (changing elements), and independent application (creating their own)."
  },
  "think time": {
    short: "Pause for students to process before responding",
    detailed: "Think time (similar to wait time) is a deliberate pause given to students to formulate their thoughts before they're expected to respond. It improves response quality, increases participation from quieter students, and supports deeper cognitive processing."
  },
  "threshold concept": {
    short: "Transformative idea that changes understanding",
    detailed: "Threshold concepts are ideas that, once understood, fundamentally transform how students see a subject. They are often troublesome, irreversible, and integrative. Identifying and focusing on threshold concepts helps teachers prioritise the most important ideas in their subject."
  },
  "tiered tasks": {
    short: "Different difficulty levels for the same learning goal",
    detailed: "Tiered tasks provide the same core learning activity at different levels of complexity, allowing all students to work towards the same learning objective at an appropriate level of challenge. This is a key differentiation strategy that maintains high expectations for all."
  },
  "transition": {
    short: "Moving between activities smoothly",
    detailed: "Transitions are the periods between activities or phases of a lesson. Well-managed transitions are quick, clear, and practised, minimising lost learning time. Effective teachers use explicit instructions, countdowns, and routines to keep transitions under 30 seconds."
  },
  "transitions": {
    short: "Movements between lesson activities",
    detailed: "Transitions are the changeover points between activities in a lesson. Effective transitions are rehearsed, swift, and maintain momentum. Poor transitions waste significant learning time over a year. Strategies include clear signals, practised routines, and explicit instructions."
  },
  "visible learning": {
    short: "Making the learning process transparent to students",
    detailed: "Visible Learning, based on John Hattie's research, makes learning goals, success criteria, and progress visible to both teachers and students. When students can see where they are and where they're going, they become active participants in their own learning."
  },
  "vocabulary instruction": {
    short: "Explicitly teaching key words and their meanings",
    detailed: "Vocabulary instruction involves deliberately teaching important words rather than assuming students will pick them up. Effective approaches include explicit definitions, multiple exposures in context, morphological analysis (word roots and parts), and opportunities to use new words in speech and writing."
  },
  "whole-class feedback": {
    short: "Feedback given to the entire class at once",
    detailed: "Whole-class feedback involves reviewing student work and identifying common strengths, errors, and misconceptions, then addressing these with the entire class. It's more efficient than individual written marking and allows for immediate re-teaching and practice."
  },
  "worked example effect": {
    short: "Learning from step-by-step demonstrations",
    detailed: "The worked example effect, from cognitive load theory, shows that novice learners benefit more from studying completed examples than from solving problems. This reduces extraneous cognitive load and allows students to focus on understanding the process."
  },
  "zpd": {
    short: "The gap between what students can do alone vs. with help",
    detailed: "ZPD (Zone of Proximal Development) is Vygotsky's concept describing the space between what a learner can accomplish independently and what they can achieve with guidance. Effective instruction targets this zone, providing appropriate challenge with sufficient support."
  },
  "deliberate practice": {
    short: "Focused effort on specific areas for improvement",
    detailed: "Deliberate practice involves targeted, effortful practice of specific skills with immediate feedback. Unlike routine practice, it focuses on areas of weakness, requires full concentration, and involves a cycle of performance, feedback, and refinement."
  },
  "direct instruction": {
    short: "Explicit, teacher-led teaching of content",
    detailed: "Direct instruction involves the teacher explicitly teaching content through clear explanations, demonstrations, and structured practice. When done well, it's highly effective for teaching new concepts, particularly for novice learners who benefit from clear, sequenced instruction."
  },
  "explicit instruction": {
    short: "Clear, direct teaching with no ambiguity",
    detailed: "Explicit instruction involves clearly stating what students will learn, demonstrating skills step-by-step, providing guided practice with feedback, and then moving to independent practice. It leaves nothing to chance and is particularly effective for foundational skills."
  },
  "flipped learning": {
    short: "Students learn content at home, apply in class",
    detailed: "Flipped learning reverses the traditional model: students engage with new content (videos, readings) at home, freeing class time for application, discussion, and practice with teacher support. This maximises the value of face-to-face time for deeper learning."
  },
  "jigsaw": {
    short: "Students become experts on one piece, then teach others",
    detailed: "The Jigsaw strategy divides content among groups — each group becomes expert on their piece, then members re-form into mixed groups to teach each other. It develops both understanding (through teaching) and interdependence (everyone's piece is needed)."
  },
  "kagan structures": {
    short: "Cooperative learning frameworks",
    detailed: "Kagan Structures are step-by-step cooperative learning strategies (like Rally Robin, Timed Pair Share, Stand Up Hand Up Pair Up) that ensure equal participation and individual accountability. They provide ready-made interaction patterns that promote engagement."
  },
  "mark-plan-teach": {
    short: "Using assessment to inform next steps",
    detailed: "Mark-Plan-Teach is a responsive cycle where teachers review student work (mark), use insights to plan targeted lessons (plan), and deliver instruction that addresses identified needs (teach). It ensures teaching is driven by evidence of student learning."
  },
  "memory": {
    short: "How information is stored and retrieved",
    detailed: "Understanding memory — working memory (limited, temporary) and long-term memory (vast, permanent) — is fundamental to effective teaching. Strategies like retrieval practice, spaced repetition, and dual coding are designed to support the transfer from working to long-term memory."
  },
  "narrate the positive": {
    short: "Publicly describing desired behaviours you can see",
    detailed: "Narrate the positive involves verbally acknowledging students who are demonstrating expected behaviours ('I can see Aisha has already opened her book'). This reinforces expectations, redirects off-task students without confrontation, and creates a positive classroom atmosphere."
  },
  "oracy skills": {
    short: "Developing students' speaking and listening abilities",
    detailed: "Oracy skills encompass the ability to articulate ideas clearly, listen actively, build on others' contributions, and use academic language. Teaching oracy explicitly — through structured talk, discussion frameworks, and presentation skills — supports learning across all subjects."
  },
  "pair work": {
    short: "Students working in twos",
    detailed: "Pair work involves students collaborating with a partner on a task. It provides a low-risk opportunity for all students to process ideas, rehearse responses, and develop understanding through dialogue before sharing with the wider class."
  },
  "positive framing": {
    short: "Phrasing instructions and feedback constructively",
    detailed: "Positive framing involves stating expectations in terms of what students should do rather than what they shouldn't. 'Walking feet in the corridor' rather than 'Don't run'. This sets clear expectations, maintains relationships, and creates a more positive learning environment."
  },
  "scaffold": {
    short: "Temporary support structure for learning",
    detailed: "A scaffold is any temporary support that helps students access content or complete tasks they couldn't manage independently. Examples include writing frames, word banks, worked examples, sentence starters, graphic organisers, and partially completed models."
  },
  "scaffolds": {
    short: "Support structures to help students access learning",
    detailed: "Scaffolds are temporary supports provided to help students engage with challenging content. These can include visual aids, sentence starters, writing frames, worked examples, graphic organisers, and structured templates. They are gradually removed as competence develops."
  },
  "semantic wave": {
    short: "Moving between abstract and concrete understanding",
    detailed: "A semantic wave describes the movement between abstract concepts and concrete examples in teaching. Effective instruction 'unpacks' abstract ideas into concrete examples (going down the wave) then 'repacks' understanding back to the abstract level (going up), deepening comprehension."
  },
  "spiral curriculum": {
    short: "Revisiting topics at increasing complexity",
    detailed: "A spiral curriculum, proposed by Jerome Bruner, introduces key concepts at a basic level and revisits them repeatedly with increasing depth and complexity. This builds on prior knowledge, reinforces learning, and allows students to develop more sophisticated understanding over time."
  },
  "student agency": {
    short: "Students taking ownership of their learning",
    detailed: "Student agency is the capacity and willingness of students to take purposeful action in their learning. It involves choice, voice, and ownership. Teachers develop agency by providing meaningful choices, encouraging self-assessment, and gradually releasing responsibility."
  },
  "end-of-unit assessment": {
    short: "Assessment at the end of a learning unit",
    detailed: "End-of-unit assessments measure what students have learned at the conclusion of a topic or unit. They help evaluate the effectiveness of teaching, identify remaining gaps, and inform future planning. They should align closely with the learning objectives covered."
  },
  "warm-strict": {
    short: "Being caring and demanding at the same time",
    detailed: "Warm-strict teaching combines high expectations with genuine care and support. Teachers maintain firm, consistent boundaries while building positive relationships. Students know the teacher believes in them AND won't accept anything less than their best effort."
  },
  "checking understanding": {
    short: "Verifying students have grasped the content",
    detailed: "Checking understanding involves using techniques beyond 'Does everyone get it?' to genuinely assess comprehension. Effective methods include targeted questions, mini whiteboards, exit tickets, and think-pair-share — all providing evidence of actual understanding rather than assumed understanding."
  },
  "high expectations": {
    short: "Believing all students can achieve and insisting they do",
    detailed: "High expectations means consistently communicating belief in every student's ability to succeed and maintaining standards that reflect this belief. Research shows teacher expectations significantly impact student outcomes — students rise or fall to meet the expectations set for them."
  },
  "key vocabulary": {
    short: "Essential subject-specific words students must know",
    detailed: "Key vocabulary refers to the critical terms and concepts students need to understand and use within a topic. Explicit teaching of key vocabulary — with definitions, examples, and repeated use in context — is essential for accessing curriculum content, especially for disadvantaged learners."
  },
  "live modelling": {
    short: "Demonstrating thinking and processes in real-time",
    detailed: "Live modelling involves the teacher demonstrating a task or process in real-time, talking through their thinking as they go. Unlike showing a pre-prepared example, live modelling reveals the messy, iterative process of expert thinking, normalises making and fixing mistakes, and makes cognitive processes visible."
  },
  "questioning sequence": {
    short: "Planned series of questions building understanding",
    detailed: "A questioning sequence is a planned progression of questions that moves from surface to deep understanding. It might start with recall, build through comprehension and application, and culminate in analysis or evaluation. Well-designed sequences scaffold thinking."
  },
  "consolidation": {
    short: "Securing and strengthening new learning",
    detailed: "Consolidation is the process of strengthening newly learned information so it becomes firmly established in long-term memory. Activities like summarising, applying knowledge to new contexts, practice exercises, and retrieval tasks all support consolidation."
  },
  "curriculum": {
    short: "The planned sequence of learning",
    detailed: "The curriculum encompasses what is taught, in what order, and why. An effective curriculum is carefully sequenced to build knowledge cumulatively, with each lesson connecting to prior and future learning. It considers both content (what) and pedagogy (how)."
  },
  "equity": {
    short: "Ensuring fair access and outcomes for all students",
    detailed: "Equity in education means ensuring every student has what they need to succeed, which may differ between students. Unlike equality (same for all), equity recognises that different students need different levels of support to achieve the same outcomes."
  },
  "group work": {
    short: "Students collaborating in small teams",
    detailed: "Effective group work involves structured collaboration where each member has a clear role and accountability. When well-designed, it develops communication skills, exposes students to different perspectives, and enables peer teaching. Without structure, it can lead to social loafing."
  },
  "hook": {
    short: "Engaging opening to capture student interest",
    detailed: "A hook is a compelling introduction to a lesson or topic designed to spark curiosity and engagement. It might be a provocative question, surprising fact, visual stimulus, story, or real-world problem. Effective hooks create a 'need to know' that drives learning."
  },
  "making connections": {
    short: "Linking new learning to existing knowledge",
    detailed: "Making connections involves explicitly helping students see relationships between new content and what they already know, other subjects, or the real world. These connections create stronger neural pathways, making new learning more meaningful and memorable."
  }
};

interface PedagogicalTooltipProps {
  term: string;
  children?: React.ReactNode;
}

export function PedagogicalTooltip({ term, children }: PedagogicalTooltipProps) {
  const termLower = term.toLowerCase();
  const termData = PEDAGOGICAL_TERMS[termLower];
  
  if (!termData) {
    return <span>{children || term}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help border-b border-dashed border-primary/50 text-primary font-medium">
            {children || term}
            <HelpCircle className="w-3.5 h-3.5 text-primary/70" />
          </span>
        </TooltipTrigger>
        <TooltipContent 
          className="max-w-sm p-4 bg-popover border border-border shadow-lg"
          side="top"
        >
          <div className="space-y-2">
            <p className="font-semibold text-foreground">{term}</p>
            <p className="text-sm text-muted-foreground italic">{termData.short}</p>
            <p className="text-sm text-foreground leading-relaxed">{termData.detailed}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper function to parse text and replace pedagogical terms with tooltips
export function parsePedagogicalTerms(text: string): React.ReactNode[] {
  const terms = Object.keys(PEDAGOGICAL_TERMS);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  
  // Create regex pattern for all terms (case insensitive)
  const pattern = new RegExp(
    `\\b(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'gi'
  );
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Add the tooltip for the matched term
    parts.push(
      <PedagogicalTooltip key={key++} term={match[1]}>
        {match[0]}
      </PedagogicalTooltip>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts;
}
