# Using SchemaWise AI

- **Schema Review:** paste CREATE TABLE SQL, run Review Schema, inspect findings and the diagram, and open the tutor explanation. Review history is stored on the server.
- **Table Designer:** create tables and columns, set keys and relationships, then send the generated SQL to the reviewer.
- **Quiz:** choose Official GATE PYQs or AI-generated practice. Choose a topic and count, then Start Quiz. Official questions retain their PDF images and answer-key links; select every correct option for a multiple-select question or enter the numerical answer. AI practice offers four text options with one correct answer and an explanation. It requires a working Groq key and is capped at 10 questions per request. AI content can be incorrect and is not an official past paper. Check your answer, retry when needed, and submit to see your score.
- **Exam Questions:** filter and load the official bank. Read the source image, answer, and check the supplied key. Open the full original PDF if a crop omits text.
- **Learn:** read the DBMS lessons and worked examples.
- **Download:** download study material, source PDFs and available results.
- **Help:** read the tour and troubleshooting guidance.

The AI status indicates provider configuration. To confirm that Groq works, generate a practice question. If AI generation fails, the official bank remains available as a separate selection.

Server history and scores are shared by users of the same deployment; this is a coursework learning app with no account isolation. On Render Free, those SQLite records reset when the service restarts, redeploys, or spins down. See DEPLOYMENT.md for deployment and submission instructions.
