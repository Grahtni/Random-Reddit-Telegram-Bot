const RandomReddit = require("reddit-posts");

async function getRandomVideoPost() {
  try {
    for (let i = 0; i < 100; i++) {
      const data = await RandomReddit.GetRandompost("latestagecapitalism");
      if (data && data.ImageURL) {
        const url = data.ImageURL;
        if (url.match("v.redd.it")) {
          console.log(data.ImageURL);
          return;
        } else {
          console.log(data.ImageURL);
        }
      }
      if (i === 99) {
        console.log("No suitable posts found.");
      }
    }
  } catch (err) {
    console.error("An error occurred:", err.message);
  }
}

getRandomVideoPost();
