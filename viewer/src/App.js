import "./App.css";
import InfiniteScroll from "react-infinite-scroll-component";
import { useState, useEffect, useRef } from "react";

function App() {
  const [currentPage, setCurrentPage] = useState(0);
  const [elements, setNewElements] = useState([]);

  async function loadMore() {
    const newItemsResponse = await fetch(
      `https://kbx4r9s734.execute-api.eu-central-1.amazonaws.com/dev/photos?skip=${
        currentPage * 10
      }`
    );
    const newItems = await newItemsResponse.json();
    console.log(newItems);
    setNewElements([...elements, ...newItems]);
    setCurrentPage(currentPage + 1);
  }

  useEffect(() => {loadMore()}, []);

  return (
    <InfiniteScroll
      className="App"
      dataLength={elements.length}
      next={loadMore}
      hasMore={true}
    >
      {elements.map((e) => (
        <div className="App-item" key={e.done_datetime}>
          <img className="App-image" src={e.photo_url} alt={e.task_name} />
          <div className="App-caption">{e.task_name} ({e.first_name} + {e.second_name})</div>
        </div>
      ))}
    </InfiniteScroll>
  );
}

export default App;
