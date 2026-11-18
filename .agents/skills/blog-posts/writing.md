# Writing a post

How a post should read. Agents drafting a post follow this, and the AI-tell audit ([`ai-tells.md`](./ai-tells.md)) checks against it.

## Voice

- The author's own sentences are the reference: the "Nx thrives on micro-packages" paragraph in [`nx-lifecycle`](../../../src/blog/nx-lifecycle.md) and the why-Go sentence in [`one-library-several-languages`](../../../src/blog/one-library-several-languages.md). They run long, with parentheses and asides, use plain words, and say why he wanted the thing.
- Rough means plain words and real detail. It doesn't mean short sentences. Don't split sentences to sound casual, and don't add slang or one-word reveals ("Nope.", "the stuff"). Three sentences under eight words in a row is too many.
- First-hand detail comes from the record (commits, plans, session notes) or from the author. Where it's missing, leave an author note (see [`SKILL.md`](./SKILL.md)). Never invent a confusion, a wrong guess or a feeling.
- Say where your knowledge stops, once, at the spot it applies ("I haven't run it on Windows"), instead of hedging the whole post.
- When AI did part of the work, say so in one plain sentence where it matters, like "I didn't open the profile myself" in [`nx-cached-verify`](../../../src/blog/nx-cached-verify.md).
- Link the first mention of anything external (a package, an RFC, a spec section), picking the target as `SKILL.md`'s Links section says.

## Openings

- The first paragraph is concrete: the result with its size and the version measured, the symptom in exact numbers, the thing nobody had measured, or what the author wanted and couldn't get. No paragraph about why the topic matters, no list of what the post will cover.
- Within the first three paragraphs, one sentence names the mechanism and the number, like "Swapping map[string]bool sets for sorted []uint64 slices helped cut heap use by 78%" ([Golang Weekly](https://golangweekly.com/issues/624)). A post with no measurement names the mechanism alone.
- The `description` follows the same rules: the result or the mechanism, no pitch. It's what the feed, dev.to and search results show.

## Titles

- A checkable claim, a result, a mechanism, or a count of real things. First person is fine, and so is an honest qualifier, like Lea Verou's "[The best dark mode toggle is probably none](https://lea.verou.me/blog/2026/dark-mode-toggles-2/)".
- Not "Name: tagline", not a multiplier as hype ("10,000x faster"), not "You should", "Here's what surprised me" or "X is dead". A question only when it's the question the author actually had, like Josh Comeau's "[Why React Re-Renders](https://www.joshwcomeau.com/react/why-react-re-renders/)".
- The number in the title, the table and the closing are the same number.

## Structure

- Headings say what the section finds or answers ("Where I'd use the others"). Reference sections ("Run it yourself") keep plain labels. Sentence case, no emoji, nothing cute ("The Setup").
- After the opening has given the result, investigations and fixes go in the order things were found, dead ends included.
- Code shows the lines a reader needs to follow the argument. Anything longer that they'd rerun goes in the repo, linked.
- A diagram only where order or state over time matters (a sequence, a before/after). Never an inventory of components.
- Stop where the content stops: the command to rerun it, a check readers can run on their own setup, what's left, thanks, a link to the follow-up. No recap, no "key takeaways", no slogan as the last line, no pitch.
- Length is whatever the material needs. "If you have half a page of thoughts, give me half a page" ([Marc Brooker](https://brooker.co.za/blog/2026/06/18/my-blog-and-ai.html)).

Common shapes, to vary rather than fill in (every post following one arc is itself a tell):

- **Comparison**: the strongest evidence first (the results table, or one worked before/after when the claim is about output shape), how it was measured, each tool's misses with the reason, where the others are the better pick, how to rerun.
- **Bug or upstream fix**: the puzzle or symptom in numbers, the hunt in order, the mechanism, the fix and its PR, what readers can check in their own setup.
- **Design decision**: the constraint, the options with their costs, the choice, what it gave up, where the rejected option still wins. Rust's [RFC template](https://github.com/rust-lang/rfcs/blob/master/0000-template.md) questions are good prompts: why not do this, and could it live somewhere else?

## Numbers

- Each run is described once (versions, date, command), and every number says which run it's from. A derived number shows its arithmetic, and the arithmetic has to work.
- Say what changed between table rows, and explain each big gap. Brendan Gregg's test: "Can they explain why the benchmark result was X, and not 2X" ([active benchmarking](https://www.brendangregg.com/activebenchmarking.html))?
- Say how many runs a figure comes from and what it is (a median, a range, a single run), and whether it's cold or warm. Say which results tests assert and which are a snapshot.
- State the assumptions before a counterfactual number ("the count assumes...").
- Keep null and failed results in the table.
- The conclusion covers the workload measured and no more.

## Comparing your own library

- Before the first result that favours it, say you wrote it and the tests. Name the bias specifically, as [rebar](https://github.com/BurntSushi/rebar/blob/master/BIAS.md) does: "I may have selected a set of benchmarks that I knew well".
- Say when another tool is the better pick, and what yours costs. Give the verdict rather than balanced pros and cons.
- Run each competitor at its best documented setup, the way its users run it. Label tuned results separately, and say what couldn't be run and why.
- Probe suites: every cell traces to a test. Outcomes are pass, fail, allowed either way by the spec, and crashed; define "partial" in a legend; state what counts as a fail, including how undocumented features are treated. No total score as the headline.
- For each loss, say why: which keyword, which code path.
- Timings: absolute numbers next to any ratio, ratios only over the cases both tools ran, the hardware, and a correctness check next to each time (the output count).
- Credit competitors' strengths specifically, link issues filed upstream, and invite corrections.
