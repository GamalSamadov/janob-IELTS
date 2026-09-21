import type { CueCard } from "./types";

export interface Part1Topic {
  id: string;
  title: string;
  questions: string[];
}

export interface CueCardTopic extends CueCard {
  /** One or two short follow-up questions asked right after the long turn. */
  roundingOff: string[];
  part3Theme: string;
  part3Questions: string[];
}

/** Part 1 always opens with work/studies, like the real test. */
export const WORK_OR_STUDY: Part1Topic = {
  id: "work-study",
  title: "work or studies",
  questions: [
    "Do you work or are you a student?",
    "What do you like most about your job or your studies?",
    "Why did you choose that job or that subject?",
    "Would you like to change anything about it in the future?",
  ],
};

export const PART1_TOPICS: Part1Topic[] = [
  {
    id: "hometown",
    title: "your hometown",
    questions: [
      "Where is your hometown?",
      "What do you like most about your hometown?",
      "Has your hometown changed much in recent years?",
      "Would you like to live there in the future?",
    ],
  },
  {
    id: "home",
    title: "your home",
    questions: [
      "Do you live in a house or an apartment?",
      "Which room in your home do you like most, and why?",
      "Is there anything you would like to change about your home?",
      "Do you plan to live there for a long time?",
    ],
  },
  {
    id: "free-time",
    title: "free time",
    questions: [
      "What do you like to do in your free time?",
      "Did you have the same hobbies when you were a child?",
      "Do you prefer spending your free time alone or with other people?",
      "Is there a new hobby you would like to try?",
    ],
  },
  {
    id: "music",
    title: "music",
    questions: [
      "What kind of music do you like?",
      "When do you usually listen to music?",
      "Did you learn to play a musical instrument as a child?",
      "Is traditional music popular in your country?",
    ],
  },
  {
    id: "food",
    title: "food and cooking",
    questions: [
      "What is your favourite food?",
      "Do you enjoy cooking?",
      "Do you prefer eating at home or eating out?",
      "Is there any food you disliked as a child but like now?",
    ],
  },
  {
    id: "weather",
    title: "weather and seasons",
    questions: [
      "What is the weather usually like where you live?",
      "Which season do you like best?",
      "Does the weather affect your mood?",
      "Do you usually check the weather forecast?",
    ],
  },
  {
    id: "reading",
    title: "reading",
    questions: [
      "Do you like reading?",
      "What kinds of books do you enjoy?",
      "Do you prefer paper books or e-books?",
      "Did you read a lot when you were a child?",
    ],
  },
  {
    id: "sport",
    title: "sport and exercise",
    questions: [
      "Do you do any sport or exercise?",
      "What sports are popular in your country?",
      "Did you do more exercise when you were younger?",
      "Do you prefer watching sport or playing it?",
    ],
  },
  {
    id: "phones",
    title: "mobile phones",
    questions: [
      "How often do you use your phone?",
      "What do you mostly use your phone for?",
      "Could you live without a smartphone?",
      "Has your phone changed the way you study or work?",
    ],
  },
  {
    id: "friends",
    title: "friends",
    questions: [
      "Do you have many close friends?",
      "How often do you meet your friends?",
      "What do you usually do together?",
      "Is it easy to make new friends as an adult?",
    ],
  },
  {
    id: "shopping",
    title: "shopping",
    questions: [
      "Do you enjoy shopping?",
      "Do you prefer shopping online or in shops?",
      "What was the last thing you bought?",
      "Are there any big markets near where you live?",
    ],
  },
  {
    id: "travel",
    title: "travelling",
    questions: [
      "Do you like travelling?",
      "Where did you go on your last holiday?",
      "Do you prefer travelling alone or with other people?",
      "Where would you like to travel in the future?",
    ],
  },
  {
    id: "weekends",
    title: "weekends",
    questions: [
      "What do you usually do at weekends?",
      "Do you prefer busy weekends or relaxing ones?",
      "What did you do last weekend?",
      "Are your weekends different now from when you were a child?",
    ],
  },
  {
    id: "transport",
    title: "transport",
    questions: [
      "How do you usually get to work or to your place of study?",
      "Is public transport good in your city?",
      "Do you like driving?",
      "How do you think transport will change in the future?",
    ],
  },
  {
    id: "films",
    title: "films",
    questions: [
      "Do you often watch films?",
      "What kind of films do you like?",
      "Do you prefer watching films at home or at the cinema?",
      "Is there a film you would like to watch again?",
    ],
  },
  {
    id: "photos",
    title: "photography",
    questions: [
      "Do you like taking photos?",
      "What do you usually take photos of?",
      "Do you prefer taking photos or being in them?",
      "Do you ever print your photos?",
    ],
  },
  {
    id: "routine",
    title: "daily routine",
    questions: [
      "Are you a morning person?",
      "What do you usually do in the morning?",
      "Has your daily routine changed recently?",
      "Which part of the day do you like most?",
    ],
  },
  {
    id: "languages",
    title: "learning languages",
    questions: [
      "How long have you been learning English?",
      "What is the most difficult thing about learning English for you?",
      "Do you speak any other languages?",
      "Would you like to learn another language in the future?",
    ],
  },
  {
    id: "celebrations",
    title: "celebrations",
    questions: [
      "What is the most important celebration in your country?",
      "How do you usually celebrate your birthday?",
      "Do you enjoy big celebrations?",
      "Have celebrations changed since you were a child?",
    ],
  },
  {
    id: "clothes",
    title: "clothes",
    questions: [
      "What kind of clothes do you like to wear?",
      "Do you care about fashion?",
      "Do you wear different clothes on weekdays and at weekends?",
      "Where do you usually buy your clothes?",
    ],
  },
  {
    id: "nature",
    title: "parks and nature",
    questions: [
      "Do you like spending time in nature?",
      "Are there any parks near your home?",
      "What do people usually do in parks in your city?",
      "Did you go to parks often when you were a child?",
    ],
  },
  {
    id: "social-media",
    title: "social media",
    questions: [
      "Do you use social media?",
      "Which apps do you use most?",
      "Do you think people spend too much time on social media?",
      "Have you ever taken a break from social media?",
    ],
  },
  {
    id: "tea",
    title: "tea and coffee",
    questions: [
      "Do you prefer tea or coffee?",
      "How often do you drink tea?",
      "Is tea important in your culture?",
      "Do you usually drink tea alone or with other people?",
    ],
  },
  {
    id: "neighbours",
    title: "neighbours",
    questions: [
      "Do you know your neighbours well?",
      "How often do you talk to them?",
      "Have your neighbours ever helped you?",
      "What makes a good neighbour?",
    ],
  },
];

export const CUE_CARDS: CueCardTopic[] = [
  {
    id: "inspiring-person",
    title: "Describe a person who has inspired you.",
    prompts: ["who this person is", "how you know them", "what they have done"],
    explain: "and explain why this person has inspired you.",
    roundingOff: ["Do you think you might inspire other people in the future?"],
    part3Theme: "role models",
    part3Questions: [
      "Who are the main role models for young people in your country?",
      "Do celebrities have a responsibility to be good role models?",
      "How has the influence of the family on young people changed compared with the past?",
      "What qualities make someone a good leader?",
      "Do people need role models in order to succeed?",
    ],
  },
  {
    id: "useful-skill",
    title: "Describe a useful skill you have learned.",
    prompts: ["what the skill is", "when and how you learned it", "how often you use it"],
    explain: "and explain why you think this skill is useful.",
    roundingOff: ["Do many people in your country have this skill?"],
    part3Theme: "learning skills",
    part3Questions: [
      "What practical skills should children learn at school?",
      "Is it better to learn a skill from a teacher or by yourself, for example online?",
      "Which skills will be most important in the job market of the future?",
      "Why do some older people find it harder to learn new skills?",
      "Should governments pay for adults to learn new skills?",
    ],
  },
  {
    id: "favourite-place",
    title: "Describe a place in your city or town that you like to visit.",
    prompts: ["where it is", "what it looks like", "what you do there"],
    explain: "and explain why you like visiting this place.",
    roundingOff: ["Do many other people visit this place?"],
    part3Theme: "cities and public places",
    part3Questions: [
      "What makes a city a good place to live?",
      "Should cities spend more money on parks and public spaces?",
      "How have cities in your country changed over the last twenty years?",
      "What are the advantages and disadvantages of living in a big city?",
      "How could governments make cities less crowded?",
    ],
  },
  {
    id: "memorable-journey",
    title: "Describe a memorable journey you have taken.",
    prompts: ["where you went", "who you went with", "what happened during the journey"],
    explain: "and explain why this journey was memorable.",
    roundingOff: ["Would you like to make this journey again?"],
    part3Theme: "travel and tourism",
    part3Questions: [
      "Why do people enjoy travelling to other places?",
      "How has tourism changed in your country in recent years?",
      "What negative effects can tourism have on local communities?",
      "Is it better to travel with a tour group or independently?",
      "Do you think people will travel more or less in the future?",
    ],
  },
  {
    id: "book-or-film",
    title: "Describe a book or a film that made a strong impression on you.",
    prompts: ["what it was", "when you read or watched it", "what it was about"],
    explain: "and explain why it made such a strong impression on you.",
    roundingOff: ["Would you recommend it to your friends?"],
    part3Theme: "reading and films",
    part3Questions: [
      "Do young people read less than they did in the past? Why?",
      "What are the benefits of reading fiction?",
      "Should films based on books follow the original story closely?",
      "How can films influence the way people think?",
      "Will printed books disappear in the future?",
    ],
  },
  {
    id: "helping-someone",
    title: "Describe a time when you helped someone.",
    prompts: ["who you helped", "why they needed help", "how you helped them"],
    explain: "and explain how you felt about helping this person.",
    roundingOff: ["Do you often help other people?"],
    part3Theme: "helping others",
    part3Questions: [
      "Why do some people enjoy helping others?",
      "Should schools teach children to help other people?",
      "Is volunteering common in your country?",
      "Do people help their neighbours less than they did in the past?",
      "Should helping people in need be the responsibility of the government or of individuals?",
    ],
  },
  {
    id: "useful-technology",
    title: "Describe a piece of technology that you find very useful.",
    prompts: ["what it is", "when you started using it", "how you use it"],
    explain: "and explain why it is so useful to you.",
    roundingOff: ["Do other members of your family use it too?"],
    part3Theme: "technology",
    part3Questions: [
      "How has technology changed the way people communicate?",
      "What are the disadvantages of relying too much on technology?",
      "Why do some older people find new technology difficult to use?",
      "At what age should children be allowed to have a smartphone?",
      "How will artificial intelligence change people's jobs?",
    ],
  },
  {
    id: "future-goal",
    title: "Describe a goal you would like to achieve in the future.",
    prompts: ["what the goal is", "when you set this goal", "what you need to do to achieve it"],
    explain: "and explain why this goal is important to you.",
    roundingOff: ["Have you told anyone about this goal?"],
    part3Theme: "ambition and success",
    part3Questions: [
      "Is it important for young people to have clear goals?",
      "What does success mean to most people in your country?",
      "Do parents put too much pressure on their children to succeed?",
      "Is money the most important measure of success?",
      "How can people stay motivated to achieve long-term goals?",
    ],
  },
  {
    id: "celebration",
    title: "Describe a celebration or festival that you enjoyed.",
    prompts: ["what the celebration was", "when and where it took place", "what people did"],
    explain: "and explain why you enjoyed it.",
    roundingOff: ["Do you like celebrating with lots of people?"],
    part3Theme: "traditions and festivals",
    part3Questions: [
      "Why are traditional festivals important for a country?",
      "Are traditional celebrations becoming less popular among young people?",
      "How has globalisation changed the way people celebrate?",
      "Should governments spend money on public celebrations?",
      "Have festivals become too commercial?",
    ],
  },
  {
    id: "teacher",
    title: "Describe a teacher who has influenced you.",
    prompts: ["who the teacher was", "what subject they taught", "what they were like"],
    explain: "and explain how this teacher influenced you.",
    roundingOff: ["Are you still in touch with this teacher?"],
    part3Theme: "education",
    part3Questions: [
      "What makes someone a good teacher?",
      "Could online learning ever replace traditional classrooms?",
      "Should students be allowed to choose what they study at school?",
      "Are exams a good way to measure a student's ability?",
      "How is the role of teachers different from the past?",
    ],
  },
  {
    id: "waiting",
    title: "Describe a time when you had to wait for something.",
    prompts: ["what you were waiting for", "how long you had to wait", "what you did while you were waiting"],
    explain: "and explain how you felt about waiting.",
    roundingOff: ["Are you usually a patient person?"],
    part3Theme: "patience and modern life",
    part3Questions: [
      "Are people less patient today than in the past? Why?",
      "In what situations do people have to wait in queues in your country?",
      "How can businesses reduce waiting times for their customers?",
      "Is patience an important quality for success?",
      "Does technology make people more impatient?",
    ],
  },
  {
    id: "good-purchase",
    title: "Describe something you bought that you were very happy with.",
    prompts: ["what it was", "where and when you bought it", "why you decided to buy it"],
    explain: "and explain why you were so happy with it.",
    roundingOff: ["Do you often buy things like this?"],
    part3Theme: "shopping and consumerism",
    part3Questions: [
      "Why do people buy things they don't really need?",
      "How does advertising influence what people buy?",
      "What are the advantages and disadvantages of online shopping?",
      "Are people in your country more materialistic than they used to be?",
      "Should advertising aimed at children be restricted?",
    ],
  },
  {
    id: "sport-activity",
    title: "Describe a sport or physical activity that you enjoy.",
    prompts: ["what it is", "when you started doing it", "how often you do it"],
    explain: "and explain why you enjoy it.",
    roundingOff: ["Do you think you will keep doing it in the future?"],
    part3Theme: "health and sport",
    part3Questions: [
      "Why don't some people do enough exercise?",
      "Should physical education be compulsory at school?",
      "Do professional athletes earn too much money?",
      "How can governments encourage people to be more active?",
      "What can children learn from playing team sports?",
    ],
  },
  {
    id: "family-member",
    title: "Describe a family member you are close to.",
    prompts: ["who this person is", "what they are like", "what you do together"],
    explain: "and explain why you are close to this person.",
    roundingOff: ["Do you and this person look similar?"],
    part3Theme: "family",
    part3Questions: [
      "How have families in your country changed in recent decades?",
      "Is it a good idea for grandparents to live with the family?",
      "Who should be responsible for looking after elderly people?",
      "Do parents spend enough time with their children nowadays?",
      "What values do parents in your culture try to teach their children?",
    ],
  },
  {
    id: "important-decision",
    title: "Describe an important decision you have made.",
    prompts: ["what the decision was", "when you made it", "how you made it"],
    explain: "and explain why this decision was important.",
    roundingOff: ["Was it difficult to make this decision?"],
    part3Theme: "making decisions",
    part3Questions: [
      "Do young people make decisions differently from older people?",
      "Should parents make important decisions for their children?",
      "Is it better to make decisions quickly or slowly?",
      "What are the most important decisions people make in their lives?",
      "Do people rely too much on the internet when they make decisions?",
    ],
  },
  {
    id: "website-app",
    title: "Describe a website or an app that you use often.",
    prompts: ["what it is", "how you found out about it", "what you use it for"],
    explain: "and explain why you use it so often.",
    roundingOff: ["Would you recommend it to other people?"],
    part3Theme: "the internet",
    part3Questions: [
      "How has the internet changed the way people learn?",
      "Should governments control what people can see on the internet?",
      "Has the internet made people's lives better overall?",
      "What are the dangers of sharing personal information online?",
      "Will people spend even more time online in the future?",
    ],
  },
];
