import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../components/ui.jsx';
import s from './auth.module.css';

export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className={s.pwWrap}>
      <Input type={show ? 'text' : 'password'} {...props} style={{ paddingRight: 44 }} />
      <button type="button" className={s.pwToggle} onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
