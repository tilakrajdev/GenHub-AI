import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/react";
import { Heart } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

axios.defaults.baseURL = import.meta.env.VITE_BASE_URL;

const Community = () => {
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    let cancelled = false;
    const fetchCreations = async () => {
      try {
        const { data } = await axios.get("/api/user/get-published-creations", {
          headers: { Authorization: `Bearer ${await getToken()}` },
        });
        if (!cancelled && data.success) setCreations(data.creations);
        else if (!cancelled) toast.error(data.message);
      } catch (error) {
        if (!cancelled)
          toast.error(error.response?.data?.message || error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCreations();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const toggleLike = async (creation) => {
    try {
      const { data } = await axios.post(
        "/api/user/toggle-like-creation",
        { id: creation.id },
        {
          headers: { Authorization: `Bearer ${await getToken()}` },
        },
      );
      if (!data.success) {
        toast.error(data.message);
        return;
      }
      setCreations((current) =>
        current.map((item) => {
          if (item.id !== creation.id) return item;
          const likes = item.likes || [];
          return {
            ...item,
            likes: likes.includes(user.id)
              ? likes.filter((like) => like !== user.id)
              : [...likes, user.id],
          };
        }),
      );
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    }
  };

  return (
    <div className="flex flex-1 h-full flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-slate-800">
        Community Creations
      </h1>
      <div className="bg-white h-full w-full rounded-xl overflow-y-scroll">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading creations...</p>
        ) : creations.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No public creations yet.</p>
        ) : (
          creations.map((creation) => (
            <div
              key={creation.id}
              className="relative group inline-block pl-3 pt-3 w-full sm:max-w-1/2 lg:max-w-1/3"
            >
              <img
                src={creation.content}
                alt=""
                className="w-full h-full object-cover rounded-lg"
              />

              <div className="absolute bottom-0 top-0 right-0 left-3 flex gap-2 items-end justify-end group-hover:justify-between p-3 group-hover:bg-linear-to-b from-transparent to-black/80 text-white rounded-lg">
                <p className="text-sm hidden group-hover:block">
                  {creation.prompt}
                </p>
                <div className="flex gap-1 items-center">
                  <p>{creation.likes?.length || 0}</p>
                  <button
                    type="button"
                    onClick={() => toggleLike(creation)}
                    aria-label="Toggle like"
                    className="cursor-pointer"
                  >
                    <Heart
                      className={`min-w-5 h-5 hover:scale-110 ${creation.likes?.includes(user?.id) ? "fill-red-500 text-red-600" : "text-white"}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Community;
