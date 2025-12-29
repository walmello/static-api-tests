module.exports = () => {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    randomNumber: Math.floor(Math.random() * 100)
  };
};
  