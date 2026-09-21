// A generation guard also works for image operations that cannot be aborted.
const BookAsyncTask = {
  create() {
    let generation = 0;
    let controller = null;
    function cancel() {
      generation++;
      controller?.abort();
      controller = null;
    }
    function start() {
      controller = new AbortController();
      return controller;
    }
    return {
      cancel,
      start,
      token: () => generation,
      isCurrent: (token) => token === generation,
      finish(token) {
        if (token === generation) controller = null;
      }
    };
  }
};
