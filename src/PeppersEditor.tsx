import {useState, useEffect, FormEvent} from 'react';
import {hc} from 'hono/client';
import {useStytchOrganization, withStytchPermissions, useStytchB2BClient, useStytchMember} from '@stytch/react/b2b';
import {PeppersApp} from "../api/PeppersAPI.ts";
import {withLoginRequired} from "./Auth.tsx";
import {Pepper, Permissions, Upvote} from "../types";
import {PermissionsMap, StytchError} from "@stytch/core/public";
import {NavLink} from "react-router-dom";
import {CircleHelp, Pen, PlusCircle, TrashIcon} from "lucide-react";
import {Modal} from "./components/modal.tsx";


const client = hc<PeppersApp>(`${window.location.origin}/api`);

// Objective and Key Result API actions
const getPeppers = () =>
    client.peppers.$get()
        .then(res => res.json())
        .then(res => res.peppers);

const createPepper = (pepperText: string) =>
    client.peppers.$post({json: {pepperText}})
        .then(res => res.json())
        .then(res => res.peppers);

const deletePepper = (id: string) =>
    client.peppers[':pepperID'].$delete({param: {pepperID: id}})
        .then(res => res.json())
        .then(res => res.peppers);

const upvotePepper = (pepperID: string) =>
    client.peppers[':pepperID'].upvote.$post({param: {pepperID}})
        .then(res => res.json())
        .then(res => res.peppers);

    const deleteUpvote = (pepperID: string) =>
    client.peppers[':pepperID'].upvote.$delete({param: {pepperID}})
        .then(res => res.json())
        .then(res => res.peppers);

type MemberProps = {
    memberID: string;
}
const DisplayedMember = ({memberID}: MemberProps) => {
    const stytch = useStytchB2BClient();
    const [memberDisplayName, setMemberDisplayName] = useState<string>('');

    useEffect(() => {
      const getMemberDisplayName = async () => {
        console.log(memberID);
        if (memberID === '-1') {
            setMemberDisplayName("Stytch Team");
            return;
        }
        if (!memberID) {
            setMemberDisplayName("Anonymous");
            return;
        }
        try {
          const members = await stytch.organization.members.search({
            query: {
              operands: [
                {
                  filter_name: "member_ids",
                  filter_value: [memberID],
                },
              ],
              operator: "AND",
            },
          });
          console.log(members);
          setMemberDisplayName(members.members[0].email_address);
        } catch (error) {
          console.error(error);
          setMemberDisplayName("Unknown Member (could not search)");
        }
      };
      getMemberDisplayName();
    }, [memberID, stytch.organization.members]);

    return (
        <div>{memberDisplayName}</div>
    )
}

type UpvoteProps = {
    pepper: Pepper,
    stytchPermissions: PermissionsMap<Permissions>,
    setPeppers: React.Dispatch<React.SetStateAction<Pepper[]>>;
}
const Upvotes = ({pepper, stytchPermissions, setPeppers}: UpvoteProps) => {
    const [upvotesList, setUpvotesList] = useState<Upvote[]>(pepper.upvotes);
    const {member} = useStytchMember();

    const canUpvote = () => {
        return stytchPermissions.pepper.upvote;
    }

    const onUpvote = () => {
        upvotePepper(pepper.id).then((peppers: Pepper[]) => {
            setPeppers(peppers);
            setUpvotesList(peppers.find(p => p.id === pepper.id)?.upvotes || []);
        });
    }

    const onDeleteUpvote = () => {
        deleteUpvote(pepper.id).then((peppers: Pepper[]) => {
            setPeppers(peppers);
            setUpvotesList(peppers.find(p => p.id === pepper.id)?.upvotes || []);
        });
    }

    const toggleUpvote = () => {
        if (upvotesList.some(upvote => upvote.memberID === member?.member_id)) {
            onDeleteUpvote();
        } else {
            onUpvote();
        }
    }

    return (
        <button disabled={!canUpvote()} onClick={() => toggleUpvote()}>
            <em>{upvotesList.length}</em>
            {upvotesList.map((upvote, index) => (
                <img key={index} className="icon" src="/pepper.png" alt={upvote.memberID} />
            ))}
        </button>
    )
}

type PepperProps = {
    pepper: Pepper;
    index: number;
    stytchPermissions: PermissionsMap<Permissions>;
    setPeppers: React.Dispatch<React.SetStateAction<Pepper[]>>;
}
const PepperEditor = ({pepper, index, stytchPermissions, setPeppers}: PepperProps) => {
    const {member} = useStytchMember();

    const onDeletePepper = (id: string) => {
        deletePepper(id).then((peppers: Pepper[]) => setPeppers(peppers));
    };

    const canDelete = () => {
        return stytchPermissions.pepper.deleteOwn && pepper.creatorID === member?.member_id
    };

    // Because we're accepting user input, might be a good idea to grant some admins the ability to delete other users' submissions.
    const canDeleteOthers = () => {
        return stytchPermissions.pepper.overrideOwnership
    };


    return (
        <li>
            <div className="pepper">
                <div className="pepper-header">
                    <div>
                        <b>#{index + 1}:</b> {pepper.pepperText}
                        <p>Pepper ID: {pepper.id}</p>
                    </div>
                </div>
                <div className="pepper-tail">
                    <div>
                        <button disabled={!canDelete() && !canDeleteOthers()} className={canDeleteOthers() ? "override" : ""} onClick={() => onDeletePepper(pepper.id)}>
                            <img className="icon" src="/trash.png" alt="Delete" />
                        </button>
                    </div>
                    <div>
                        <em className="citation">
                            <DisplayedMember memberID={pepper.creatorID} />
                        </em>
                    </div>
                </div>
            </div>

        </li>
    )
}

type EditorProps = {
    stytchPermissions: PermissionsMap<Permissions>;
};
const PeppersRanking = ({stytchPermissions}: EditorProps) => {
    const {organization} = useStytchOrganization();
    const [peppers, setPeppers] = useState<Pepper[]>([]);

    const [infoModalOpen, setInfoModalOpen] = useState(() => {
        const storedValue = sessionStorage.getItem("showInfoModal");
        return storedValue ? JSON.parse(storedValue) : true;
    });

    const [modalOpen, setModalOpen] = useState(false);
    const [newPepperText, setNewPepperText] = useState('');

    // Fetch Peppers on component mount
    useEffect(() => {
        if (stytchPermissions.pepper.read) {
            getPeppers().then(peppers => setPeppers(peppers));
        }
    }, [stytchPermissions.pepper.read]);

    const onAddPepper = (evt: FormEvent) => {
        evt.preventDefault();
        createPepper(newPepperText).then(peppers => setPeppers(peppers));
        setNewPepperText('');
        setModalOpen(false);
    };

    const canCreate = stytchPermissions.pepper.create;

    return (
        <main>
            <div className="peppersRanking">

                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
                    <form onSubmit={onAddPepper}>
                        <h3>Create a new Spicy Pepper</h3>
                        <p>
                            What is a controversial opinion you have?
                        </p>
                        <div className="input-group">
                            <input
                                disabled={!canCreate}
                                type="text"
                                placeholder="Enter Spicy Pepper Text"
                                value={newPepperText}
                                onChange={(e) => setNewPepperText(e.target.value)}
                                required
                            />
                            <button type="submit" className="primary">Add Spicy Pepper</button>
                        </div>
                    </form>
                </Modal>


                <h1>
                    Spicy Peppers for {organization?.organization_name}
                    <button className="text" onClick={() => setInfoModalOpen(true)}><CircleHelp/></button>
                </h1>
                <ul>
                    {peppers.map((pepper, i) => (
                        <div>
                            <PepperEditor
                                key={pepper.id}
                                index={i}
                                pepper={pepper}
                                stytchPermissions={stytchPermissions}
                                setPeppers={setPeppers}
                            />
                            <Upvotes pepper={pepper} stytchPermissions={stytchPermissions} setPeppers={setPeppers} />
                        </div>
                    ))}
                    {peppers.length === 0 && (
                        <li>
                            No spicy peppers defined yet....
                        </li>
                    )}
                </ul>
                <button disabled={!canCreate} className="primary" onClick={() => setModalOpen(true)}>
                    Add Spicy Pepper
                </button>
            </div>
        </main>
    );
}


const GatedPeppersRanking = withLoginRequired(withStytchPermissions<Permissions, object>(PeppersRanking));
export default GatedPeppersRanking;