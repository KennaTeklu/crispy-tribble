// Blog post #9 (originally embedded inline in the old SPA index.html)
window.blogPosts = window.blogPosts || [];
window.blogPosts.push({
    title: "Why I built Brain — a 3D map for self-study",
    date: "2026-09-20",
    slug: "why-i-built-brain",
    tags: ["building", "story"],
    excerpt: "Outlines hide the shape of what you're learning. I wanted to see it.",
    body: "<p>I got tired of staring at outlines. A textbook chapter flattens everything into a numbered list and the structure — what depends on what, what feeds into what — disappears. You can read the whole chapter and still not know how the pieces connect.</p>" +
        "<p>Brain started as a side project to fix that for myself. Drop a PDF in, get a 3D starfield back. Topics are nodes. Relationships are lines between them. You can rotate the map, zoom in on a cluster, and immediately see which concepts are foundational and which are leaves.</p>" +
        "<p>The color part came later. Red means \"I don't know this yet.\" Green means \"got it.\" As you study and quiz yourself, the stars change color, so the map becomes a progress bar in space. It sounds silly until you watch a section you've been avoiding turn from red to green — then it makes sense.</p>" +
        "<p>Everything runs in your browser. Files never leave your device. There is no cloud copy of your notes, no account database, no analytics. That was the rule from day one: your study material belongs to you.</p>" +
        "<p>If that sounds useful, <a href='https://brain.try4ever.com' target='_blank' rel='noopener'>try it free for 7 days</a> — no card needed. Or write to <a href='mailto:support@try4ever.com'>support@try4ever.com</a> and tell me what you're studying.</p>"
});
