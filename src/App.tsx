import {BrowserRouter as Router, Route, Routes, Navigate} from 'react-router-dom';
import {StytchB2BProvider} from "@stytch/react/b2b";
import {StytchB2BUIClient} from "@stytch/vanilla-js/b2b";

import PeppersEditor from "./PeppersEditor.tsx";
import {Authorize, MemberSettings, Nav, SignUpOrLogIn} from "./Auth.tsx";

const stytch = new StytchB2BUIClient(import.meta.env.VITE_STYTCH_PUBLIC_TOKEN ?? '', {
    endpointOptions: {
      testApiDomain: import.meta.env.VITE_TEST_API_URL,
    }
});

function App() {
    return (
        <StytchB2BProvider stytch={stytch}>
            <Router>
                <Nav />
                <Routes>
                    <Route path="/login" element={<SignUpOrLogIn/>}/>
                    <Route path="/oauth/authorize" element={<Authorize/>}/>
                    <Route path="/authenticate" element={<SignUpOrLogIn/>}/>

                    <Route path="/peppers" element={<PeppersEditor/>}/>

                    <Route path="/settings/members" element={<MemberSettings/>}/>

                    <Route path="*" element={<Navigate to="/peppers"/>}/>
                </Routes>
            </Router>
        </StytchB2BProvider>
    )
}

export default App

