require("dotenv").config();
const { Bot, webhookCallback, HttpError, GrammyError } = require("grammy");
const RandomReddit = require("reddit-posts");
const path = require("path");
const { gfycat } = require("gfycat-api");

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
  // Logging

  const from = ctx.from;
  const name =
    from.last_name === undefined
      ? from.first_name
      : `${from.first_name} ${from.last_name}`;
  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.msg.text}`
  );
  // Logic

  if (!/^[a-zA-Z0-9_-]+$/.test(ctx.msg.text)) {
    await ctx.reply("*Send a valid subreddit name like cats or aww.*", {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.msg.message_id,
    });
  } else {
    const statusMessage = await ctx.reply(
      `*Getting posts from r/${ctx.msg.text}*`,
      {
        parse_mode: "Markdown",
      }
    );
    async function deleteMessageWithDelay(fromId, messageId, delayMs) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          bot.api
            .deleteMessage(fromId, messageId)
            .then(() => resolve())
            .catch((error) => reject(error));
        }, delayMs);
      });
    }
    await deleteMessageWithDelay(ctx.from.id, statusMessage.message_id, 3000);
    try {
      for (let i = 0; i < 6; i++) {
        if (i == 5) {
          break;
        }
        const data = await RandomReddit.GetRandompost(ctx.msg.text);
        const extension = path.extname(data.ImageURL);
        const markdownChars = /[_*[\]()~`>#+-=|{}.!]/g;
        const title = data.title.replace(markdownChars, "\\$&");
        const author = data.Author.replace(markdownChars, "\\$&");

        if (
          (extension === ".jpg" && !data.ImageURL.match(".gif.jpg")) ||
          extension === ".png"
        ) {
          await ctx.replyWithPhoto(data.ImageURL, {
            caption: `[${title}](${data.url})\n${data.UpVotes} upvotes\nBy ${author}`,
            parse_mode: "Markdown",
          });
        } else if (data.ImageURL.includes(".gif.jpg")) {
          let newUrl = data.imageUrl.slice(0, data.imageUrl.lastIndexOf("."));
          await ctx.replyWithVideo(newUrl, {
            caption: `[${title}](${data.url})\n${data.UpVotes} upvotes\nBy ${author}`,
            parse_mode: "Markdown",
          });
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
        } else if (extension === ".gif" || extension === ".mp4") {
          await ctx.replyWithVideo(data.ImageURL, {
            caption: `[${title}](${data.url})\n${data.UpVotes} upvotes\nBy ${author}`,
            parse_mode: "Markdown",
          });
        } else if (data.ImageURL.match("v.redd.it")) {
          await ctx.reply(ImageURL + "\n" + post);
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
        if (error.message.includes("Forbidden: bot was blocked by the user")) {
          console.log("Bot was blocked by the user");
        } else if (error.message.includes("Call to 'sendVideo' failed!")) {
          console.log("Error sending video");
          await ctx.reply(`*Error contacting Reddit.*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        } else {
          await ctx.reply(`*An error occurred: ${error.message}*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        }
        console.log(`Error sending message: ${error.message}`);
        return;
      } else {
        console.log(`An error occured:\n${error}`);
        await ctx.reply(
          `*An error occurred. Are you sure you sent a valid Reddit link?*\n_Error: ${error.message}_`,
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
