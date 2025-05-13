import {useState, useEffect, FormEvent} from 'react';
import {hc} from 'hono/client';
import {useStytchOrganization, withStytchPermissions, useStytchB2BClient, useStytchMember} from '@stytch/react/b2b';
import {PeppersApp} from "../api/PeppersAPI.ts";
import {withLoginRequired} from "./Auth.tsx";
import {Pepper, Permissions, Upvote} from "../types";
import {PermissionsMap} from "@stytch/core/public";
import {NavLink} from "react-router-dom";
import {Modal} from "./components/modal.tsx";
import {CircleHelp} from "lucide-react";
import { QRCode } from "react-qrcode-logo";


const client = hc<PeppersApp>(`${window.location.origin}/api`);

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
          let displayName = members.members[0].name;
          if (displayName.length == 0) {
            displayName = members.members[0].email_address.split('@')[0];
          }
          setMemberDisplayName(displayName);
        } catch (error) {
          console.error(error);
          setMemberDisplayName("Unknown Member (could not search)");
        }
      };
      getMemberDisplayName();
    }, [memberID, stytch.organization.members]);

    return (
        <strong>{memberDisplayName}</strong>
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
        upvotePepper(pepper.uuid).then((peppers: Pepper[]) => {
            setPeppers(peppers);
            setUpvotesList(peppers.find(p => p.uuid === pepper.uuid)?.upvotes || []);
        });
    }

    const onDeleteUpvote = () => {
        deleteUpvote(pepper.uuid).then((peppers: Pepper[]) => {
            setPeppers(peppers);
            setUpvotesList(peppers.find(p => p.uuid === pepper.uuid)?.upvotes || []);
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
        <button className="upvote-button" disabled={!canUpvote()} onClick={() => toggleUpvote()}>
            <em>{upvotesList.length == 0 ? "No upvotes" : upvotesList.length}</em>
            {upvotesList.map((upvote, index) => (
                <img key={index} className="icon" src="/pepper.png" alt={upvote.memberID} />
            ))}
        </button>
    )
}

type PepperProps = {
    pepper: Pepper;
    stytchPermissions: PermissionsMap<Permissions>;
    setPeppers: React.Dispatch<React.SetStateAction<Pepper[]>>;
}
const PepperEditor = ({pepper, stytchPermissions, setPeppers}: PepperProps) => {
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
                    <h3>{pepper.pepperText}</h3>
                </div>
                <em className="citation">
                    Created by: <DisplayedMember memberID={pepper.creatorID}/>
                </em>
                <div className="pepper-tail">
                    <div>
                        <em>
                            Key: <code>{pepper.uuid.substring(pepper.uuid.length - 5)}</code>
                        </em>
                    </div>
                    <Upvotes pepper={pepper} stytchPermissions={stytchPermissions} setPeppers={setPeppers} />
                    <button
                        disabled={!canDelete() && !canDeleteOthers()}
                        className={canDeleteOthers() ? "override" : ""}
                        onClick={() => onDeletePepper(pepper.uuid)}
                    >
                        <img
                            className="icon"
                            src="/trash.png"
                            alt="Delete"
                        />
                    </button>
                </div>
            </div>
        </li>
    );
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

    const onInfoModalClose = () => {
        sessionStorage.setItem("showInfoModal", JSON.stringify(false));
        setInfoModalOpen(false);
    }

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

    // SSE for real-time updates
    useEffect(() => {
        let eventSource: EventSource | null = null;
        let retryCount = 0;
        const MAX_RETRIES = 5;
        const RETRY_DELAY = 5000; // 5 seconds
        let heartbeatTimeout: NodeJS.Timeout;

        const connectSSE = () => {
            if (eventSource) {
                eventSource.close();
            }

            eventSource = new EventSource("/api/peppers/state-changes");
            
            eventSource.onmessage = (event) => {
                console.log(`Received SSE event: ${event.data}`);
                // Reset retry count on successful message
                retryCount = 0;
                getPeppers().then((peppers) => {
                    setPeppers(peppers);
                });
            };

            eventSource.onerror = (event) => {
                console.error(`Error on SSE event: ${JSON.stringify(event)}`);
                
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }

                // Clear any existing heartbeat timeout
                if (heartbeatTimeout) {
                    clearTimeout(heartbeatTimeout);
                }

                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`Attempting to reconnect (${retryCount}/${MAX_RETRIES})...`);
                    setTimeout(connectSSE, RETRY_DELAY);
                } else {
                    console.error('Max retry attempts reached. Please refresh the page to reconnect.');
                }
            };

            // Add heartbeat check
            const checkHeartbeat = () => {
                if (eventSource?.readyState === EventSource.CLOSED) {
                    console.error('SSE connection closed unexpectedly');
                    if (eventSource) {
                        eventSource.close();
                        eventSource = null;
                    }
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        console.log(`Attempting to reconnect after heartbeat failure (${retryCount}/${MAX_RETRIES})...`);
                        setTimeout(connectSSE, RETRY_DELAY);
                    }
                }
            };

            // Check heartbeat every 30 seconds
            heartbeatTimeout = setInterval(checkHeartbeat, 30000);
        };

        connectSSE();

        // Cleanup function
        return () => {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
            }
        };
    }, []);

    const canCreate = stytchPermissions.pepper.create;

    return (
        <main>
            <div className="peppersRanking">
                <Modal isOpen={infoModalOpen} onClose={onInfoModalClose}>
                    <h3>About Spicy Peppers</h3>
                    <p>
                        Spicy Peppers is a demo application that shows how to
                        use Stytch to manage and vote on a list of "spicy
                        peppers" (controversial opinions). It has both a web UI
                        (here!) and a MCP server running on Cloudflare at{" "}
                        <b>{window.location.origin}/sse</b> that you can connect
                        to with the Cloudflare{" "}
                        <a href="https://playground.ai.cloudflare.com/">
                            {" "}
                            Workers AI Playground
                        </a>
                    </p>
                    <hr />
                    <div className="codes">
                        <span className="qr-code-container">
                            <h4>This app:</h4>
                            <QRCode
                                value={window.location.origin}
                                size={300}
                                qrStyle={"squares"}
                                fgColor={"#000000"}
                                ecLevel={"Q"}
                            />
                        </span>
                        <span className="qr-code-container">
                            <h4>Cloudflare Playground:</h4>
                            <QRCode
                                value="https://playground.ai.cloudflare.com/"
                                size={300}
                                qrStyle={"squares"}
                                fgColor={"#000000"}
                                ecLevel={"Q"}
                            />
                        </span>
                    </div>
                </Modal>

                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
                    <form onSubmit={onAddPepper}>
                        <h3>Create a new Spicy Pepper</h3>
                        <p>What is a controversial opinion you have?</p>
                        <div className="input-group">
                            <input
                                disabled={!canCreate}
                                type="text"
                                placeholder="Enter Spicy Pepper Text"
                                value={newPepperText}
                                onChange={(e) =>
                                    setNewPepperText(e.target.value)
                                }
                                required
                            />
                            <button type="submit" className="primary">
                                Add Spicy Pepper
                            </button>
                        </div>
                    </form>
                </Modal>

                <h1 id="title">
                    Spicy Peppers for {organization?.organization_name}
                    <button
                        className="text"
                        onClick={() => setInfoModalOpen(true)}
                    >
                        <CircleHelp />
                    </button>
                </h1>
                <button
                    disabled={!canCreate}
                    className="primary create-pepper"
                    onClick={() => setModalOpen(true)}
                >
                    Add Spicy Pepper
                </button>
                <ul>
                    {peppers.map((pepper) => (
                        <PepperEditor
                            key={pepper.uuid + pepper.upvotes.length} // I'm sure there's a better way to do this. React was seeing that the order changed, but not deeply that upvotes changed. Force the issue with a hybrid key
                            pepper={pepper}
                            stytchPermissions={stytchPermissions}
                            setPeppers={setPeppers}
                        />
                    ))}
                    {peppers.length === 0 && (
                        <li>No spicy peppers defined yet....</li>
                    )}
                </ul>
            </div>
        </main>
    );
}


const GatedPeppersRanking = withLoginRequired(withStytchPermissions<Permissions, object>(PeppersRanking));
export default GatedPeppersRanking;