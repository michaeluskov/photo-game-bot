import "./App.css";
import InfiniteScroll from "react-infinite-scroll-component";
import { useState, useEffect } from "react";

let getAllItemsPromise = null;
const getAllItems = () => {
  if (getAllItemsPromise) return getAllItemsPromise;
  getAllItemsPromise = (async () => {
    const newItemsResponse = await fetch(
      `photos.json`
    );
    return newItemsResponse.json();
  })();
  return getAllItemsPromise;
};

const items = async (skip) => {
  const allItems = await getAllItems();
  return allItems.slice(skip, skip + 10);
};

function App() {
  const [currentPage, setCurrentPage] = useState(0);
  const [elements, setNewElements] = useState([]);

  async function loadMore() {
    const newItems = await items(currentPage * 10);
    console.log(newItems);
    setNewElements([...elements, ...newItems]);
    setCurrentPage(currentPage + 1);
  }

  useEffect(() => {
    loadMore();
  }, []);

  return (
    <InfiniteScroll
      className="App"
      dataLength={elements.length}
      next={loadMore}
      hasMore={true}
    >
      {elements.map((e) => (
        <div className="App-item" key={e._id}>
          <img className="App-image" src={e.photo_url} alt={e.task_name} />
          <div className="App-caption">{e.task_name}</div>
        </div>
      ))}
    </InfiniteScroll>
  );
}

export default App;
