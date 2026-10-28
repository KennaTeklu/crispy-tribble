// Blog post #11 (originally embedded inline in the old SPA index.html)
window.blogPosts = window.blogPosts || [];
window.blogPosts.push({
    title: "Spaced repetition vs. 3D maps — which one wins for visual learners?",
    date: "2026-09-21",
    slug: "spaced-repetition-vs-3d-maps",
    tags: ["studying", "spaced-repetition"],
    excerpt: "They solve different problems. You probably want both.",
    body: "<p>Spaced repetition (Anki, etc.) is unbeatable for memorizing discrete facts: drug names, anatomy terms, vocabulary, dates. It schedules reviews so you see a card just before you'd forget it. The unit is one card, one fact.</p>" +
        "<p>A 3D knowledge map solves a different problem. The unit is not a fact, it's a structure — how concepts in a chapter depend on each other, which topics are foundational, which are applications of which. You can memorize every card in a deck and still not see the structure.</p>" +
        "<p>For visual learners, the structure problem is the hard one. You can pass a multiple-choice exam with rote memorization and still not understand the material. A map forces you to see the shape.</p>" +
        "<p>The honest answer: use both. Use spaced repetition for the facts you have to memorize. Use the map for the structure you have to understand. Brain's quizzes can feed into both — the mastery color on the map updates after each quiz, so the two systems share state instead of living in separate apps.</p>"
});
