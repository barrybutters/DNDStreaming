const path = require("node:path");
const { Service } = require("./service");
const service = new Service(
  process.env.DIRECTOR_DATA || path.join(process.cwd(), ".preview-data"),
);
service.listen(true).then((url) => console.log("Preview: " + url));
process.on("SIGINT", async () => {
  await service.close();
  process.exit();
});
