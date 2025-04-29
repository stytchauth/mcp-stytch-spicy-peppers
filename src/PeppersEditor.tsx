import {useState, useEffect, FormEvent} from 'react';
import {hc} from 'hono/client';
import {useStytchOrganization, withStytchPermissions} from '@stytch/react/b2b';
import {PeppersApp} from "../api/PeppersAPI.ts";
import {withLoginRequired} from "./Auth.tsx";
import {Pepper, Permissions, Upvote} from "../types";
import {PermissionsMap} from "@stytch/core/public";
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
        deletePepper(id).then(peppers => setPeppers(peppers));
    };

    const canDelete = stytchPermissions.pepper.delete;

    return (
        <li>
            <div className="pepper">
                <div className="pepper-header">
                    <div>
                        <b>Spicy Pepper #{index + 1}:</b> {pepper.pepperText}
                    </div>
                    <div>
                        <button disabled={!canDelete} className="text" onClick={() => onDeletePepper(pepper.id)}>
                            <TrashIcon/>
                        </button>
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
            console.log("Fetching peppers");
            getPeppers().then(peppers => setPeppers(peppers));
        }
    }, [stytchPermissions.pepper.read]);

    const onAddPepper = (evt: FormEvent) => {
        evt.preventDefault();
        createPepper(newPepperText).then(peppers => setPeppers(peppers));
        setNewPepperText('');
        setModalOpen(false);
    };

    console.log(stytchPermissions.pepper);
    const canCreate = stytchPermissions.pepper.create;

    return (
        <main>
            <div className="peppersEditor">

                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
                    <form onSubmit={onAddPepper}>
                        <h3>Create a new Spicy Pepper</h3>
                        <p>
                            What is a high level goal your Organization needs to accomplish?
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
                            <button type="submit" className="primary">Add Objective</button>
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