# The AI-tell audit

Every agent-drafted post gets this audit before the author reviews it, from a fresh agent given only the draft, this file and [`writing.md`](./writing.md), so it hasn't seen how the draft was written. Be harsh.

How to run it:

- Run the grep below, then read for every other item. Quote each hit and give a rough rewrite direction, not a polished replacement.
- Leave the author's own sentences alone, and raise any doubt about one as a question for him. The brief names which sentences are his: git can't tell, since agents commit as him.
- Swapping a dash for a comma while keeping the sentence's shape just moves the tell. Usually the fix is to cut, or to put in a fact the model couldn't have known.
- Don't overcorrect: short choppy runs, slang and planted roughness read as fake too.
- One pass. A second pass only checks the first one's edits, for choppiness, lost facts, phrases now repeated and mentions of other posts that lost their link.

```sh
grep -n -i -E '—|delv|crucial|pivotal|underscor|showcas|testament|landscape|realm|intricate|seamless|robust|powerful|effortless|game.changer|serves as|stands as|boasts|here.s (why|the thing|what)|the result\?|key takeaways|in conclusion' src/blog/<slug>.md
```

## Content

- A paragraph you can delete without losing anything: delete it.
- A claim a model could write without the repo: replace it with the version, timing or log line from the run, or cut it.
- A sentence restating the table above it: cut.
- A sentence explaining why the post doesn't meet one of the repo's own rules, which no reader asked about: cut.
- Vague attribution ("developers often", "most comparisons"): name who, with a link, or own the claim.
- Pitch words: state the limit instead.
- Pros and cons written as if balanced: give the verdict.

## Paragraphs

- Setup, complication, then a one-line punchline: end where the information ends.
- A short kicker sentence closing a paragraph: fold it into the sentence before, or cut it.
- A slogan as the post's last line: end on the command, the next step or the open question.
- An opening that explains the topic and then says it again: start at the second paragraph.
- Signposts ("Here's why", "The result?", "The rest of this post is"), and rhetorical questions as transitions: state the point.
- The reversal, "A looked slow but wasn't. What was slow was B.": say what B did, once.

## Sentences

- "X, not Y" and "Rather than X,": keep it only if the post or a linked source shows someone holding X. Otherwise say what it does.
- Parallel phrases or adjectives in threes that add no facts ("fast, simple and reliable"): keep the one that carries the point. Counted real items (three versions, three tested behaviours) are fine.
- A colon that sets up a reveal. Colons that define or list are fine.
- Trailing ", highlighting...", ", ensuring...": delete, or make it a claim with evidence.
- Stacked hedges: keep at most one, where the doubt actually is.
- "serves as", "stands as", "boasts", "features" for is or has. "notes", "explains", "highlights" for says.

## Formatting

- Em dashes: none. Restructure the sentence.
- A bold lead-in on every bullet, emoji, title-case or cute headings.
- A long or defensive note about AI use: one plain sentence saying what it did.
