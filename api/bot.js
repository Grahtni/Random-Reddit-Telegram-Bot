require("dotenv").config();
const { Bot, webhookCallback, HttpError, GrammyError } = require("grammy");
const RandomReddit = require("reddit-posts");
const path = require("path");

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

// DB

const mysql = require("mysql2");
const connection = mysql.createConnection(process.env.DATABASE_URL);

// Response

async function responseTime(ctx, next) {
  const before = Date.now();
  await next();
  const after = Date.now();
  console.log(`Response time: ${after - before} ms`);
}

bot.use(responseTime);

// Commands

bot.command("start", async (ctx) => {
  await ctx
    .reply("*Welcome!* ✨ Send the name of a subreddit.", {
      parse_mode: "Markdown",
    })
    .then(() => {
      connection.query(
        `
SELECT * FROM users WHERE userid = ?
`,
        [ctx.from.id],
        (error, results) => {
          if (error) throw error;
          if (results.length === 0) {
            connection.query(
              `
    INSERT INTO users (userid, username, firstName, lastName, firstSeen)
    VALUES (?, ?, ?, ?, NOW())
  `,
              [
                ctx.from.id,
                ctx.from.username,
                ctx.from.first_name,
                ctx.from.last_name,
              ],
              (error, results) => {
                if (error) throw error;
                console.log("New user added:", ctx.from);
              }
            );
          } else {
            console.log("User exists in database.", ctx.from);
          }
        }
      );
    })
    .catch((error) => console.error(error));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This bot downloads random posts from Reddit.\nSend a subreddit name to try it out!_",
      { parse_mode: "Markdown" }
    )
    .then(console.log("Help command sent to", ctx.from.id))
    .catch((error) => console.error(error));
});

// Messages

bot.on("msg", async (ctx) => {
  console.log("Query received:", ctx.msg.text, "from", ctx.from.id);
  if (!/^[a-zA-Z0-9_-]+$/.test(ctx.msg.text)) {
    await ctx.reply("*Send a valid subreddit name like cats or aww.*", {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.msg.message_id,
    });
  } else {
    await ctx
      .reply(`*Getting posts from r/${ctx.msg.text}*`, {
        parse_mode: "Markdown",
      })
      .catch((error) => console.error(error));
    try {
      for (let i = 0; i < 7; i++) {
        if (i == 6) {
          await ctx
            .reply(
              "*Failed to get posts. Are you sure you sent a valid subreddit name?*",
              { parse_mode: "Markdown" }
            )
            .catch((e) => console.error(e));
          break;
        }
        const data = await RandomReddit.GetRandompost(ctx.msg.text);
        const extension = path.extname(data.ImageURL);
        const markdownChars = /[_*[\]()~`>#+-=|{}.!]/g;
        const title = data.title.replace(markdownChars, "\\$&");
        const author = data.Author.replace(markdownChars, "\\$&");

        if (extension === ".jpg") {
          await ctx.replyWithPhoto(data.ImageURL, {
            caption: `[${title}](${data.url})\n${data.UpVotes} upvotes\nBy ${author}`,
            parse_mode: "Markdown",
          });
          break;
        } else if (data.ImageURL.match("gfycat")) {
          const id = data.ImageURL.split("/").pop();
          console.log(id);
          const post = await gfycat.getPost(id);
          const link = post.sources.find((obj) => obj.type === "mp4").url;
          console.log(link);
          await ctx.replyWithVideo(link, {
            caption: `[${title}](${data.url})\n${data.UpVotes} upvotes\nBy ${author}`,
            parse_mode: "Markdown",
          });
          break;
        } else if (extension === ".gif" || extension === ".mp4") {
          await ctx.replyWithVideo(data.ImageURL, {
            caption: `[${title}](${data.url})\n${data.UpVotes} upvotes\nBy ${author}`,
            parse_mode: "Markdown",
          });
          break;
        } else if (
          //data.ImageURL.match("v.redd.it") ||
          //data.ImageURL.match("redgifs") ||
          //data.ImageURL.match("gallery") ||
          extension === ".html" ||
          extension === ".cms"
        ) {
          await ctx.reply(
            `[${title}](${data.url})\n${data.UpVotes} upvotes\nBy ${author}`,
            {
              parse_mode: "Markdown",
            }
          );
          break;
        } else {
        }
      }
    } catch (error) {
      if (error instanceof GrammyError) {
        console.log(`Error sending message: ${error.message}`);
        return;
      } else {
        console.log("An error occurred");
        await ctx.reply(
          `*An error occurred. Are you sure you sent a valid subreddit name?*`,
          { parse_mode: "Markdown", reply_to_message_id: ctx.msg.message_id }
        );
        return;
      }
    }
  }
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    "Error while handling update",
    ctx.update.update_id,
    "\nQuery:",
    ctx.msg.text
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

export default webhookCallback(bot, "http");
