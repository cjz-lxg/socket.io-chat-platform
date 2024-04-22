export function self({ app }) {
  app.get("/self", async (req, res) => {
    console.log(req.body);
    if (req.user) {
      res.status(200).send(req.user);
    } else {
      res.status(401).end();
    }
  });
}
