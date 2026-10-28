import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import UserDetailsModal from "../components/UserDetailsModal";
import { useUser } from "../hooks/useUsers";
import useToastFeedback from "../../hooks/useToastFeedback";

export default function UserDetails() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const { data: user, isPending, error } = useUser(userId);
  useToastFeedback(error?.message);
  if (isPending) return <LoadingState/>;
  if (error && !user) return <p className="py-10 text-center text-slate-400">User details are unavailable.</p>;
  if (!user) return <div className="py-10 text-center">User not found.</div>;
  return <><Button variant="secondary" onClick={() => navigate("/admin/users")}><ArrowLeft size={17}/> Back to users</Button><UserDetailsModal user={user} onClose={() => navigate("/admin/users")}/></>;
}