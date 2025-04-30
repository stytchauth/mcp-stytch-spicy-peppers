import {useState, useEffect, FormEvent} from 'react';
import {hc} from 'hono/client';
import {useStytchOrganization, withStytchPermissions, useStytchB2BClient} from '@stytch/react/b2b';
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
    client.peppers[':id'].$delete({param: {id}})
        .then(res => res.json())
        .then(res => res.peppers);

const upvotePepper = (id: string) =>
    client.peppers[':id'].upvotes.$post({
        param: {id},
        // @ts-expect-error RPC inference is not working
        json: {keyResultText}
    })
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
          setMemberDisplayName("Unknown Member");
        }
      };
      getMemberDisplayName();
    }, []);

    return (
        <div>{memberDisplayName}</div>
    )
}

type PepperProps = {
    pepper: Pepper;
    index: number;
    stytchPermissions: PermissionsMap<Permissions>;
    setPeppers: React.Dispatch<React.SetStateAction<Pepper[]>>;
}
const PepperEditor = ({pepper, index, stytchPermissions, setPeppers}: PepperProps) => {
    const [pepperText, setPepperText] = useState<string>('');
    const [upvotes, setUpvotes] = useState<Upvote[]>([]);

    const onDeletePepper = (id: string) => {
        deletePepper(id).then((peppers: Pepper[]) => setPeppers(peppers));
    };

    const canDelete = stytchPermissions.pepper.delete;
    const canUpdate = stytchPermissions.pepper.update;


    return (
        <li>
            <div className="pepper">
                <div className="pepper-header">
                    <div>
                        <b>#{index + 1}:</b> {pepper.pepperText}
                    </div>
                </div>
                <div className="pepper-tail">
                    <div>
                        <button disabled={!canDelete} onClick={() => onDeletePepper(pepper.id)}>
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
                        <PepperEditor
                            key={pepper.id}
                            index={i}
                            pepper={pepper}
                            stytchPermissions={stytchPermissions}
                            setPeppers={setPeppers}
                        />
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